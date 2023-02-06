import SparqlJS from 'npm:sparqljs'
export const SparqlGenerator = SparqlJS.Generator
import N3 from 'npm:n3'
export const Parser = N3.Parser
export const namedNode = N3.DataFactory.namedNode
export const literal = N3.DataFactory.literal
export const defaultGraph = N3.DataFactory.defaultGraph
export const quad = N3.DataFactory.quad
export const variable = N3.DataFactory.variable

export type { ShaclProperty } from 'https://deno.land/x/shacl_meta@0.4/types.ts'
export { Parser as ShaclParser } from 'https://deno.land/x/shacl_meta@0.4/mod.ts'

