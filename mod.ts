import { ShaclParser, SparqlGenerator, quad, namedNode, literal, variable, ShaclProperty } from './deps.ts'
import { ContextParser, JsonLdContextNormalized } from 'https://esm.sh/jsonld-context-parser@2.2.2'
import { optional, filterIn, lang, bind } from './helpers.ts'
import { ParserOutput } from 'https://deno.land/x/shacl_meta@0.3/types.ts'
import { Parser } from 'https://esm.sh/n3@1.16.3'
import { RdfObjectLoader } from 'npm:rdf-object'

export class Generator {

    private shacl: string
    private vocabAlias: string | undefined
    private prefixes: { [key: string]: string }
    private metas: ParserOutput = {}
    private source: string
    private context: JsonLdContextNormalized | undefined
    private sparqlGenerator: any

    constructor (source: string, shacl: string, vocabAlias?: string, prefixes: { [key: string]: string } = {}) {
        this.source = source
        this.shacl = shacl
        this.vocabAlias = vocabAlias
        this.prefixes = prefixes
        this.sparqlGenerator = new SparqlGenerator()
        /** @ts-ignore */
        return this.init().then(() => this)
    }

    get mainMeta () {
        return this.metas[Object.keys(this.metas)[0]]
    }

    async init () {
        const shaclParser = new ShaclParser()
        this.metas = await shaclParser.parse(this.shacl)

        const contextPrefixes = {
            ...shaclParser.shaclParser._prefixes,
            ...this.prefixes
        }

        if (this.vocabAlias) {
            contextPrefixes['@vocab'] = contextPrefixes[this.vocabAlias]
        }

        const contextParser = new ContextParser({
            skipValidation: true,
            expandContentTypeToBase: true,
        })

        this.context = await contextParser.parse(contextPrefixes, {
            baseIRI: contextPrefixes[this.vocabAlias!]
        })
    }

    async list (limit = 10, offset = 0) {
        const iris = await this.getIris(limit, offset)
        const objects = await this.getObjectsByIri(iris)
        return objects
    }

    async getObjectsByIri (iris: Array<string>) {
        const query = this.constructQuery(iris)
        const body = new FormData()
        body.set('query', query)

        const response = await fetch(this.source, {
            body,
            method: 'POST',
            headers: {
                'accept': 'application/n-triples'
            }
        })

        const text = await response.text()
        return this.turtleToObjects(text)
    }

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
                    .replaceAll(this.vocabAlias + ':', '')

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

    rdfTermValueToTypedVariable = (value: any) => {
        if (value.datatype?.value === 'http://www.w3.org/2001/XMLSchema#date') return new Date(value.value)
        if (value.datatype?.value === 'http://www.w3.org/2001/XMLSchema#integer') return parseInt(value.value)
        if (value.datatype?.value === 'http://www.w3.org/2001/XMLSchema#string') return value.value
        if (value.datatype?.value === 'http://www.w3.org/1999/02/22-rdf-syntax-ns#langString') return value.value
    
        if (value.type === 'literal') return value.value
        if (value.type === 'uri') return value.value
    
        return value.value
    }
    

    async getIris (limit = 10, offset = 0) {
        const query = this.selectQuery(limit, offset)
        const body = new FormData()
        body.set('query', query)

        const response = await fetch(this.source, {
            body,
            method: 'POST',
            headers: {
                'accept': 'application/sparql-results+json'
            }
        })

        const { results: { bindings } } = await response.json()
        return bindings.map((binding: any) => binding.s.value)
    }

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

    where () {
        return [
            quad(
                variable('s'), 
                namedNode(this.context!.expandTerm('rdf:type', true)!), 
                namedNode(this.mainMeta.attributes.targetClass)
            ),
            ...this.mainMeta.properties.map(shaclProperty => this.processTriple(shaclProperty))
        ]
    }

    compactIriToName (iri: string) {
        const compactedIri = this.context!.compactIri(iri, true)
        return compactedIri.replaceAll(':', '')
    }

    processTemplate (shaclProperty: ShaclProperty) {
        const name = this.compactIriToName(shaclProperty.predicate as string)
        return quad(variable('s'), namedNode(shaclProperty.predicate as string), variable(name))
    }

    join (shaclProperty: ShaclProperty) {
        const name = this.compactIriToName(shaclProperty.predicate as string)

        const statement = quad(
            variable('s'), 
            namedNode(shaclProperty.predicate as string), 
            variable(name)
        )

        return shaclProperty.required ? statement : optional(statement)
    }

    processTriple (shaclProperty: ShaclProperty) {
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
    
}