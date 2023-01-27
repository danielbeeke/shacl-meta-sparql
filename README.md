# SHACL meta SPARQL

Provides a `ShaclModel`. Configure this `ShaclModel` with a SHACL text file and it will in make it possible to query a SPARQL endpoint. You can get individual items or do pagination.

You can combine this with [shacl-meta-type](https://github.com/danielbeeke/shacl-meta-type) for type completion.

## How to use `ShaclModel`

```TypeScript
    import { ShaclModel } from 'shacl-meta-sparql'

    const personShacl = Deno.readTextFileSync('./shapes/Person.ttl')
    
    const people = await new ShaclModel({
        endpoint: 'https://dbpedia.org/sparql', 
        shacl: personShacl, 
        vocab: 'dbo', 
        prefixes: {
            'label': 'rdfs:label',
            'type': 'rdf:type',
        }
    })

    const twoPaginatedPersons = await people.get( /* limit */ 2, /* offset */ 6)
    // An array of Persons

    const onePerson = await people.get( /* iri */ 'http://dbpedia.org/resource/Alvin_Plantinga')
    // One Person

    const twoPersons = await people.get( /* Array<iri> */ [
      'http://dbpedia.org/resource/Alvin_Plantinga', 
      'http://dbpedia.org/resource/Alva_Noë'
    ])
    // An array of Persons

```

### Outputs something like the following:

```JavaScript
[
  {
    id: "http://dbpedia.org/resource/Alva_Noë",
    label: "Alva Noë",
    thumbnail: "http://commons.wikimedia.org/wiki/Special:FilePath/Alva_Noë_(3419836383).jpg?width=300"
  },
  {
    id: "http://dbpedia.org/resource/Alvin_Plantinga",
    label: "Alvin Plantinga",
    thumbnail: "http://commons.wikimedia.org/wiki/Special:FilePath/Alvin_Plantinga-3.jpg?width=300",
    birthPlace: [
      { id: "http://dbpedia.org/resource/Ann_Arbor,_Michigan", label: "Ann Arbor" },
      { id: "http://dbpedia.org/resource/Michigan", label: "Michigan" }
    ],
    birthDate: 1932-11-15T00:00:00.000Z
  }
]
```