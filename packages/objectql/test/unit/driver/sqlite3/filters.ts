import { SteedosSchema, SteedosSqlite3Driver, SteedosQueryOptions, SteedosDatabaseDriverType } from '../../../../src';
import { expect } from 'chai';
import path = require("path");

let databaseUrl = path.join(__dirname, "sqlite-test.db");
// let databaseUrl = ':memory:';
let tableName = "TestFiltersForSqlite3";
let driver: SteedosSqlite3Driver;

describe('filters for sqlite3 database', () => {
    try {
        require("sqlite3");
    }
    catch (ex) {
        return true;
    }
    let result: any;
    let expected: any;
    let testIndex: number = 0;

    let tests = [
        {
            title: "filter records with filters",
            options: {
                fields: ["id", "name"],
                filters: [["name", "=", "ptr"], ["title", "=", "PTR"]]
            },
            expected: {
                length: 1
            }
        },
        {
            title: "filter records with odata query string",
            options: {
                fields: ["id", "name"],
                filters: "(name eq 'ptr') and (title eq 'PTR')"
            },
            expected: {
                length: 1
            }
        },
        {
            title: "filter records with empty array",
            options: {
                fields: ["id", "name"],
                filters: []
            },
            expected: {
                length: 2
            }
        },
        {
            title: "filter records with empty string",
            options: {
                fields: ["id", "name"],
                filters: ""
            },
            expected: {
                length: 2
            }
        },
        {
            title: "records count with filters",
            function: "count",
            options: {
                fields: ["id", "name"],
                filters: [["name", "=", "ptr"], ["title", "=", "PTR"]]
            },
            expected: {
                eq: 1
            }
        },
        {
            title: "records count with odata query string",
            function: "count",
            options: {
                fields: ["id", "name"],
                filters: "(name eq 'ptr') and (title eq 'PTR')"
            },
            expected: {
                eq: 1
            }
        }
    ];

    before(async () => {
        let mySchema = new SteedosSchema({
            datasources: {
                default: {
                    driver: SteedosDatabaseDriverType.Sqlite,
                    url: databaseUrl,
                    objects: {
                        test: {
                            label: 'Sqlite3 Schema',
                            tableName: tableName,
                            fields: {
                                id: {
                                    label: '主键',
                                    type: 'text',
                                    primary: true
                                },
                                name: {
                                    label: '名称',
                                    type: 'text'
                                },
                                title: {
                                    label: '标题',
                                    type: 'text'
                                },
                                count: {
                                    label: '数量',
                                    type: 'number'
                                }
                            }
                        }
                    }
                }
            }
        });
        const datasource = mySchema.getDataSource("default");
        await datasource.registerEntities();
        driver = <SteedosSqlite3Driver>datasource.adapter;
    });

    beforeEach(async () => {
        await driver.insert(tableName, { id: "ptr", name: "ptr", title: "PTR", count: 120 });
        await driver.insert(tableName, { id: "cnpc", name: "cnpc", title: "CNPC", count: 18 });

        let queryOptions: SteedosQueryOptions = tests[testIndex].options;
        expected = tests[testIndex].expected;
        let functionName: string = tests[testIndex].function;
        try {
            if (functionName){
                result = await driver[functionName](tableName, queryOptions);
            }
            else{
                result = await driver.find(tableName, queryOptions).catch((ex: any) => { console.error(ex); return false; });
            }
        }
        catch (ex) {
            result = ex;
        }
    });

    afterEach(async () => {
        await driver.delete(tableName, "ptr");
        await driver.delete(tableName, "cnpc");
    });

    tests.forEach(async (test) => {
        it(`arguments:${JSON.stringify(test)}`, async () => {
            testIndex++;
            if (expected.error !== undefined) {
                expect(result.message).to.be.eq(expected.error);
            }
            if (expected.length !== undefined) {
                expect(result).to.be.length(expected.length);
            }
            if (expected.eq !== undefined) {
                expect(result).to.be.eq(expected.eq);
            }
        });
    });
});

