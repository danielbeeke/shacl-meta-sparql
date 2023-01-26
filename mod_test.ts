import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { ShaclModel } from './mod.ts'
import { Parser } from 'https://esm.sh/sparqljs'

Deno.test('Output of constructQuery', async () => {
    const personShacl = Deno.readTextFileSync('./shapes/Person.ttl')
    
    const people = await new ShaclModel({
        endpoint: 'https://dbpedia.org/sparql', 
        shacl: personShacl, 
        vocab: 'dbo', 
        prefixes: {
            'label': 'rdfs:label',
            'type': 'rdf:type',
            'name': 'foaf:name',
            'thumb': 'dbo:thumbnail',
        }
    })

    const data = await people.get(2)
    console.log(data)
})