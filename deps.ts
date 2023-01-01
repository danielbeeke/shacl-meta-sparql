export { Generator as SparqlGenerator } from 'https://esm.sh/sparqljs@3.6.2'
import { DataFactory } from 'https://esm.sh/n3@1.16.3'

export const namedNode = DataFactory.namedNode
export const literal = DataFactory.literal
export const defaultGraph = DataFactory.defaultGraph
export const quad = DataFactory.quad
export const variable = DataFactory.variable

export type { Quad } from 'https://esm.sh/n3@1.16.3'
export type { ShaclProperty } from 'https://deno.land/x/shacl_meta@0.3/types.ts'
export { Parser as ShaclParser } from 'https://deno.land/x/shacl_meta@0.3/mod.ts'