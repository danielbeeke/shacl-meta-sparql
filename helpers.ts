const createOperation = (operator: string) => (...args: Array<any>) => {
    return {
        "type": "operation",
        "operator": operator,
        "args": args
    }
}

export const isiri = createOperation('isIri')
export const negate = createOperation('!')
export const isliteral = createOperation('isLiteral')
export const notEquals = createOperation('!=')
export const equals = createOperation('=')
export const datatype = createOperation('datatype')
export const lang = createOperation('lang')
export const and = createOperation('&&')
export const or = createOperation('||')
export const inOperator = createOperation('in')

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
        "patterns": Array.isArray(inner) ? inner : [inner],
    }
}

export const filterIn = (...args: Array<any>) => {
    return {
        "type": "filter",
        "expression": inOperator(...args)
    }
}

export const filterOr = (...args: Array<any>) => {
    return {
        "type": "filter",
        "expression": or(...args)
    }
}

export const filterIs = (...args: Array<any>) => {
    return {
        "type": "filter",
        "expression": equals(...args)
    }
}

export const filter = (...args: Array<any>) => {
    return {
        "type": "filter",
        "expression": {
            "type": "operation",
            "args": args
        }
    }
}

export const bind = (variable: any, expression: any) => {
    return {
        "type": "bind",
        "variable": variable,
        "expression": expression
    }
}

export const group = (inner: any) => {
    return {
        type: "group",
        patterns: Array.isArray(inner) ? inner : [inner]
    }
}

export const values = (variableName: string, inner: any) => {
    return {
        "type": "values",
        "values": (Array.isArray(inner) ? inner : [inner]).map(item => ({
            [`?${variableName}`]: item
        }))
    }
}

export const constructQuery = ({ template, where, prefixes }: { template: any, where: any, prefixes: any }) => {
    return {
        "queryType": "CONSTRUCT",
        "template": template,
        "where": where,
        "type": "query",
        "prefixes": prefixes
    }
}

export const selectQuery = ({ variables, where, limit, offset }: { variables: any, where: any, limit: any, offset: any }) => {
    return {
        "queryType": "SELECT",
        "type": "query",
        "where": where,
        "variables": variables,
        "limit": limit,
        "offset": offset,
    }
}


