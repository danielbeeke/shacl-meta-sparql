import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { Generator } from './mod.ts'

Deno.test('Output of constructQuery', async () => {
    const personShacl = Deno.readTextFileSync('./shapes/Person.ttl')
    
    const people = await new Generator('https://dbpedia.org/sparql', personShacl, 'dbp', {
        'label': 'rdfs:label',
        'type': 'rdf:type',
        'name': 'foaf:name',
        'thumb': 'dbo:thumbnail',
    })

    const items = await people.list(4)
    console.log(items)
})