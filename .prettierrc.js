// @ts-check

/** @type {import("@serverless-guru/prettier-plugin-import-order").PrettierConfig} */
{
    "importOrder": ["^@core/(.*)$", "^@server/(.*)$", "^@ui/(.*)$", "^[./]"],
    "importOrderTypeImportsToTop": true,
    "importOrderTypeImportsTmoBottom": false,
    "importOrderBuiltinModulesToTop": true,
    "importOrderCaseInsensitive": false,
    "importOrderParserPlugins": ["typescript", "jsx", "decorators-legacy"],
    "importOrderMergeDuplicateImports": true,
    "importOrderSeparation": true,
    "importOrderSortIndividualImports": true,
}