import { ShaclParser, SparqlGenerator, quad, namedNode, literal, variable, ShaclProperty, Quad } from './deps.ts'

export const optional = (inner: any) => {
    return {
        "type": "optional",
        "patterns": Array.isArray(inner) ? inner : [inner]
    }
}

export const bgp = (inner: any) => {
    return {
        "type": "bgp",
        "triples": Array.isArray(inner) ? inner : [inner]
    }
}

export const union = (inner: any) => {
    return {
        "type": "union",
        "patterns": Array.isArray(inner) ? inner : [inner]
    }
}

export const filterIn = (argument: any, values: Array<any>) => {
    return {
        "type": "filter",
        "expression": {
          "type": "operation",
          "operator": "in",
          "args": [
            argument,
            values
          ]
        }
    }
}

export const lang = (inner: any) => {
    return {
        "type": "operation",
        "operator": "lang",
        "args": [inner]
    }
}

export const or = (values: Array<any>) => {
    return {
        "type": "operation",
        "operator": "||",
        "args": values
    }
}

export const bind = (name: string, inner: any) => {
    return {
        "type": "bind",
        "variable": {
          "termType": "Variable",
          "value": name
        },
        "expression": {
          "type": "operation",
          "operator": "coalesce",
          "args": inner
        }
      }
}