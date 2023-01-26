# SHACL meta SPARQL

Convert SHACL to SPARQL queries with which you can get objects from a SPARQL endpoint that conform to the SHACL shape.

# TODO

Here is one query doing everything at once.

```sparql
PREFIX db: <http://dbpedia.org/>
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX dbp: <http://dbpedia.org/property/>
PREFIX dbo: <http://dbpedia.org/ontology/>

CONSTRUCT { ?s ?p ?o }
#SELECT *
WHERE {
  ?s ?p ?o .
  FILTER(ISIRI(?o) || LANG(?o) = 'en' || LANG(?o) = 'nl')

  { SELECT ?this
    WHERE {
    	?this a dbo:Philosopher .
#      VALUES ?this { <http://dbpedia.org/resource/Amina_Mama> }
    }
    LIMIT 1
    OFFSET 12
  }
    
  { 
    BIND (?this as ?s)
  }
    
  UNION {
    ?this ?p ?o # This should not be needed but Virtuoso is not accepting a BIND(?this as ?s) and given back results. However the bid must be done anyway.
     FILTER(?this = ?s) # It seems this speed things up.
     VALUES ?p { rdfs:label dbo:thumbnail }
  }
  
  UNION {
  	?this dbp:birthPlace ?s .
    VALUES ?p { rdfs:label dbo:country dbo:type }
  }

  
}
LIMIT 10
```