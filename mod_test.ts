import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { ShaclModel } from './mod.ts'

Deno.test('Output of constructQuery', async () => {
    const personShacl = Deno.readTextFileSync('./shapes/Person.ttl')
    
    const people = await new ShaclModel({
        endpoint: 'https://dbpedia.org/sparql', 
        shacl: personShacl, 
        vocab: 'dbp', 
        prefixes: {
            'label': 'rdfs:label',
            'type': 'rdf:type',
            'name': 'foaf:name',
            'thumb': 'dbo:thumbnail',
        }
    })

    const items = await people.list(4, 4)
    
    assertEquals(items.map(item => item.label), ['Anaximander', 'Alexander Zinoviev', 'Anaximenes of Miletus', 'André Glucksmann'])

    const soren = await people.get('http://dbpedia.org/resource/Søren_Kierkegaard')
    assertEquals(soren.label, 'Søren Kierkegaard')
})