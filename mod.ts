import { ShaclParser, SparqlGenerator, quad, namedNode, literal, variable, ShaclProperty } from './deps.ts'
import { ContextParser, JsonLdContextNormalized } from 'https://esm.sh/jsonld-context-parser@2.2.2'
import { optional, filterIn, lang, bind } from './helpers.ts'
import { ParserOutput } from 'https://deno.land/x/shacl_meta@0.3/types.ts'
import { Parser } from 'https://esm.sh/n3@1.16.3'
import { RdfObjectLoader } from 'npm:rdf-object'

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
     * Main external method, returns listings of objects, supports pagination.
     */
    async list (limit = 10, offset = 0) {
        const iris = await this.getIris(limit, offset)
        const objects = await this.getObjectsByIri(iris)
        return objects
    }

    /**
     * Second main external method, returns objects by iri(s).
     */
    get (iris: Array<string>): Promise<Array<any>>
    get (iri: string): Promise<any>
    async get (input: string | Array<string>) {
        const iris = Array.isArray(input) ? input : [input]
        const results = await this.getObjectsByIri(iris)
        return Array.isArray(input) ? results : results[0]
    }

    /**
     * Fetches objects by IRI from the endpoint.
     */
    async getObjectsByIri (iris: Array<string>) {
        const query = this.constructQuery(iris)
        const body = new FormData()
        body.set('query', query)

        console.log(query)

        const response = await fetch(this.options.endpoint, {
            body,
            method: 'POST',
            headers: {
                'accept': 'application/n-triples'
            }
        })

        const text = await response.text()
        return this.turtleToObjects(text)
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
            .filter(([iri, resource]) => resource.property['rdf:type']?.value === this.mainMeta.attributes.targetClass)

        return objects.map(([iri, object]) => {
            const jsObject: { [key: string]: any } = {
                id: iri
            }

            for (const property of this.mainMeta.properties) {
                const predicate = property.predicate as string
                const values = (property.multiple ? object.properties[predicate] : [object.property[predicate]]).filter(Boolean)

                const compactedName = this.context!
                    .compactIri(predicate, true)!
                    .replaceAll(this.options.vocab + ':', '')

                const jsValues = values
                    .map(value => this.rdfTermValueToTypedVariable(value.term))
                    .filter(Boolean)

                if (values.length) {
                    jsObject[compactedName] = property.multiple ? jsValues : jsValues[0]
                }
            }

            return jsObject
        })
    }

    /**
     * The fetch action to get IRIs
     */
    async getIris (limit = 10, offset = 0) {
        const query = this.selectQuery(limit, offset)
        const body = new FormData()
        body.set('query', query)

        console.log(query)

        const response = await fetch(this.options.endpoint, {
            body,
            method: 'POST',
            headers: {
                'accept': 'application/sparql-results+json'
            }
        })

        const { results: { bindings } } = await response.json()
        return bindings.map((binding: any) => binding.s.value)
    }

    /**
     * A select query, this returns IRIs.
     */
    selectQuery (limit = 10, offset = 0) {
        const prefixes = this.context!.getContextRaw()
        delete prefixes['@vocab']
        delete prefixes['@base']

        const query = {
            "queryType": "SELECT",
            "distinct": true,
            "variables": [variable('s')],
            "where": this.where(),
            "limit": limit,
            "offset": offset,
            "type": "query",
            "prefixes": prefixes
        }

        return this.sparqlGenerator.stringify(query)
    }

    /**
     * A construct query, this returns full objects.
     */
    constructQuery (iris: Array<string>) {
        const templates = this.mainMeta.properties.map(shaclProperty => this.processTemplate(shaclProperty))

        const prefixes = this.context!.getContextRaw()
        delete prefixes['@vocab']
        delete prefixes['@base']

        const query = {
            "queryType": "CONSTRUCT",
            "template": templates,
            "where": [
                {
                    "type": "values",
                    "values": iris.map(iri => ({"?s": namedNode(iri)})),        
                },
                ...this.where()
            ],
            "type": "query",
            "prefixes": prefixes
        }

        return this.sparqlGenerator.stringify(query)
    }

    /**
     * The whole where statement for queries.
     */
    where () {
        return [
            quad(
                variable('s'), 
                namedNode(this.context!.expandTerm('rdf:type', true)!), 
                namedNode(this.mainMeta.attributes.targetClass)
            ),
            ...this.mainMeta.properties.map(shaclProperty => this.processShaclProperty(shaclProperty))
        ]
    }

    /**
     * Compacting is not enough for name identifiers, we also need to remove the colons.
     */
    compactIriToName (iri: string) {
        const compactedIri = this.context!.compactIri(iri, true)
        return compactedIri.replaceAll(':', '')
    }

    /**
     * Creates the template part for one SHACL property, for a CONSTRUCT query
     */
    processTemplate (shaclProperty: ShaclProperty) {
        const name = this.compactIriToName(shaclProperty.predicate as string)
        return quad(variable('s'), namedNode(shaclProperty.predicate as string), variable(name))
    }

    /**
     * A basic join for a SHACL property
     */
    join (shaclProperty: ShaclProperty) {
        const name = this.compactIriToName(shaclProperty.predicate as string)

        const statement = quad(
            variable('s'), 
            namedNode(shaclProperty.predicate as string), 
            variable(name)
        )

        return shaclProperty.required ? statement : optional(statement)
    }

    /**
     * Adds the query where parts for one shacl property.
     */
    processShaclProperty (shaclProperty: ShaclProperty) {
        const parts = []

        const name = this.compactIriToName(shaclProperty.predicate as string)

        if (!shaclProperty.languageIn) parts.push(this.join(shaclProperty))

        const values: Array<string> = (shaclProperty.hasValue ? [shaclProperty.hasValue] : shaclProperty.in) as Array<string>
        if (values?.length) {
            parts.push(filterIn(variable(name), values.map(value => value.includes('://') ? namedNode(value) : literal(value))))
        }

        if (shaclProperty.languageIn) {
            const langCodes = (shaclProperty.languageIn as unknown as Array<string>)
            for (const langCode of langCodes) {
                const name = this.compactIriToName(shaclProperty.predicate as string)

                parts.push(optional(quad(
                    variable('s'), 
                    namedNode(shaclProperty.predicate as string), 
                    variable(name + '_' + langCode)
                )))

                parts.push(filterIn(
                    lang(variable(name + '_' + langCode)), 
                    [literal(langCode)]
                ))

            }

            parts.push(bind(name, langCodes.map(langCode => variable(name + '_' + langCode))))
        }

        return parts
    }
    
    /**
     * Converts a RDFjs object to a JavaScript primative
     */
    rdfTermValueToTypedVariable = (value: any) => {
        if (value.datatype?.value === 'http://www.w3.org/2001/XMLSchema#date') return new Date(value.value)
        if (value.datatype?.value === 'http://www.w3.org/2001/XMLSchema#integer') return parseInt(value.value)
        if (value.datatype?.value === 'http://www.w3.org/2001/XMLSchema#string') return value.value
        if (value.datatype?.value === 'http://www.w3.org/1999/02/22-rdf-syntax-ns#langString') return value.value
    
        if (value.type === 'literal') return value.value
        if (value.type === 'uri') return value.value
    
        return value.value
    }
    
}