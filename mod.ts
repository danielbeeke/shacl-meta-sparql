import { ShaclParser, SparqlGenerator, quad, namedNode, literal, variable, ShaclProperty, Parser } from './deps.ts'
import { ContextParser, JsonLdContextNormalized } from 'npm:jsonld-context-parser'
import { lang, bind, bgp, group, union, filterIs, values, filterOr, filterIn, notEquals, inOperator, equals, datatype, isliteral, and, isiri, filter, constructQuery, selectQuery } from './helpers.ts'
import { ParserOutput } from 'https://deno.land/x/shacl_meta@0.3/types.ts'
import { RdfObjectLoader, Resource } from 'npm:rdf-object'

const LANGSTRING = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#langString'

export type Options = {
    endpoint: string,
    shacl: string,
    vocab?: string,
    prefixes: { [key: string]: string }
}

export class ShaclModel {

    private metas: ParserOutput = {}
    private context: JsonLdContextNormalized | undefined
    private sparqlGenerator: any = new SparqlGenerator()
    private options: Options

    constructor (options: Options) {
        this.options = options
        /** @ts-ignore */
        return this.init().then(() => this)
    }

    get mainMeta () {
        return this.metas[Object.keys(this.metas)[0]]
    }

    get otherMetas () {
        return Object.values(this.metas).filter(meta => meta !== this.mainMeta)
    }

    async init () {
        const shaclParser = new ShaclParser()
        this.metas = await shaclParser.parse(this.options.shacl)

        const contextPrefixes = {
            ...shaclParser.shaclParser._prefixes,
            ...this.options.prefixes
        }

        if (this.options.vocab) {
            contextPrefixes['@vocab'] = contextPrefixes[this.options.vocab]
        }

        const contextParser = new ContextParser({
            skipValidation: true,
            expandContentTypeToBase: true,
        })

        this.context = await contextParser.parse(contextPrefixes, {
            baseIRI: contextPrefixes[this.options.vocab!]
        })
    }

    /**
     * Given the turtle text and the meta data, returns an array of JavaScript objects.
     */
    async turtleToObjects (turtleText: string) {
        const parser = new Parser()

        const quads = await parser.parse(turtleText)

        const loader = new RdfObjectLoader({ context: this.context!.getContextRaw() })
        await loader.importArray(quads)

        const objects = Object.entries(loader.resources)
            .filter(([_iri, resource]) => resource.property['urn:shacl-meta-sparql']?.value === 'urn:shacl-meta-sparql')
        
        // We start with the main objects.
        return objects.map(([iri, object]) => this.propertyToObject(loader, iri, object, this.mainMeta.properties))
    }

    /**
     * Transforms an RDF resource recursively to JS.
     */
    propertyToObject (loader: RdfObjectLoader, iri: string, object: Resource, properties: Array<ShaclProperty>) {
        const jsObject: { [key: string]: any } = { id: iri }

        for (const property of properties) {
            const predicate = property.predicate as string

            const values = (property.multiple ? object.properties[predicate] : [object.property[predicate]]).filter(Boolean)

            const compactedName = this.context!
                .compactIri(predicate, true)!
                .replaceAll(this.options.vocab + ':', '')

            let jsValues = values
                .map(value => this.rdfTermValueToTypedVariable(value.term))
                .filter(Boolean)

            // Recursion.
            if (property.nodeKind) {
                const ids = values.map(value => value.term.value)
                const nestedMeta = this.metas[property.nodeType as string]
                jsValues = ids.map(id => this.propertyToObject(loader, id, loader.resources[id], nestedMeta.properties))
            }
    
            if (values.length) {
                jsObject[compactedName] = property.multiple ? jsValues : jsValues[0]
            }
        }

        return jsObject
    }


    /**
     * Fetches objects by IRI from the endpoint.
     */
    get<T> (iri: string): Promise<T>
    get<T> (iris: Array<string>): Promise<Array<T>>
    get<T> (limit: number, offset?: number): Promise<Array<T>>
    async get<T>(input1: string | Array<string> | number = 10, input2 = 0) {

        const iris = Array.isArray(input1) ? input1 : (typeof input1 === 'string' ? [input1] : [])
        const limit = typeof input1 === 'number' ? input1 : 10
        const offset = typeof input2 === 'number' ? input2 : 0

        const query = this.query(limit, offset, iris)

        console.log(query)

        const body = new FormData()
        body.set('query', query)

        const response = await fetch(this.options.endpoint, {
            body,
            method: 'POST',
            headers: { 'accept': 'application/n-triples' }
        })

        const text = await response.text()

        const objects = await this.turtleToObjects(text)
        if (typeof input1 === 'string') return objects[0]
        return objects
    }

    /**
     * A construct query, this returns full objects.
     */
    query (limit = 10, offset = 0, iris: Array<string> = []) {
        const prefixes = this.context!.getContextRaw()
        delete prefixes['@vocab']
        delete prefixes['@base']

        const aliasses: Map<string, string> = new Map()
        const getAlias = (iri: string) => {
            if (!aliasses.has(iri)) aliasses.set(iri, iri.split(/\/|#/g).pop()!)
            return aliasses.get(iri)!
        }

        const spo = () => quad(variable('s'), variable('p'), variable('o'))

        const mainPredicates: Array<string> = this.mainMeta.properties
            .map((shaclProperty: ShaclProperty) => shaclProperty.predicate as string)

        const nestedProperties = this.mainMeta.properties
            .filter(property => property.nodeType)

        const addBaseFilters = (properties: Array<ShaclProperty>) => {
            return properties.filter(property => property.in || property.hasValue)
            .map(property => {
                return [
                    quad(variable('this'), namedNode(property.predicate as string), variable(getAlias(property.predicate as string))),
                    filterIn(
                        variable(getAlias(property.predicate as string)), 
                        (property.in as unknown as Array<string> ?? [property.hasValue] as unknown as Array<string>)
                            .map(iri => namedNode(iri))
                    )
                ]
            })
            .flat()
        }

        const addFilters = (properties: Array<ShaclProperty>) => {
            return [
                ...properties
                .filter(property => property.nodeKind)
                .map(property => {
                    return filterOr(
                        notEquals(variable('p'), namedNode(property.predicate as string)),
                        isiri(variable('o'))
                    )
                }),

                ...properties
                .filter(property => property.languageIn)
                .map(property => {                 
                    return filterOr(
                        notEquals(variable('p'), namedNode(property.predicate as string)),
                        inOperator(lang(variable('o')),  (property.languageIn as unknown as Array<string>).map(langCode => literal(langCode)))
                    )
                }),

                ...properties
                .filter(property => property.dataType)
                .map(property => {
                    if (property.dataType === LANGSTRING) {
                        return filterOr(
                            notEquals(variable('p'), namedNode(property.predicate as string)),
                            and(isliteral(variable('o')), notEquals(lang(variable('o')), literal('')))
                        )
                    }

                    return filterOr(
                        notEquals(variable('p'), namedNode(property.predicate as string)),
                        equals(datatype(variable('o')), namedNode(property.dataType as string))
                    )
                }),
            ]
        }

        const rdfType = this.context?.expandTerm('rdf:type', true)!
        const template = [spo(), quad(variable('this'), namedNode('urn:shacl-meta-sparql'), namedNode('urn:shacl-meta-sparql'))]

        const innerWhere = [
            bgp(quad(variable('this'), namedNode(rdfType), namedNode(this.mainMeta.attributes.targetClass))),
            ...addBaseFilters(this.mainMeta.properties),
            iris?.length ? values('this', iris.map((namedNode))) : null,
        ].filter(Boolean)

        const where = [
            spo(),
            group(selectQuery({ where: innerWhere, offset, limit, variables: [variable('this')] })),
            union([
                group(bind(variable('s'), variable('this'))),
                group([
                    quad(variable('this'), variable('p'), variable('o')),
                    filterIs(variable('this'), variable('s')),
                    values('p', mainPredicates.map((namedNode))),
                    ...addFilters(this.mainMeta.properties),
                ]),
                union(nestedProperties.map(property => {
                    const meta = this.metas[property.nodeType as string]

                    const predicates: Array<string> = meta.properties.map(property => property.predicate as string)

                    return [
                        group([
                            quad(
                                variable('this'),
                                namedNode(property.predicate as string),
                                variable('s')
                            ),
                            values('p', predicates.map(namedNode)),
                            ...addFilters(meta.properties),
                        ])
                    ]
                }))
            ]),
        ]

        const query = constructQuery({ template, where, prefixes })

        return this.sparqlGenerator.stringify(query)
    }

    /**
     * Converts a RDFjs object to a JavaScript primative
     */
    rdfTermValueToTypedVariable (value: any) {
        if (value.datatype?.value === 'http://www.w3.org/2001/XMLSchema#date') return new Date(value.value)
        if (value.datatype?.value === 'http://www.w3.org/2001/XMLSchema#integer') return parseInt(value.value)
        if (value.datatype?.value === 'http://www.w3.org/2001/XMLSchema#string') return value.value
        if (value.datatype?.value === 'http://www.w3.org/1999/02/22-rdf-syntax-ns#langString') return value.value
        if (value.type === 'literal') return value.value
        if (value.type === 'uri') return value.value
        return value.value
    }

}