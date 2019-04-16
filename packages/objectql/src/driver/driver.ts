import { Dictionary, JsonMap } from '@salesforce/ts-types';
import { SteedosQueryOptions } from "../types/query";
import { SteedosIDType, SteedosObjectType, SteedosObjectTypeConfig } from "../types";
import { SteedosColumnType } from './columnType';

export type SteedosDriverConfig = {
    url: string
    username?: string
    password?: string
    options?: any
};

export interface SteedosDriver {

    //constructor(url:string): any;
    // new(config: SteedosDriverConfig): any;
    connect();
    disconnect();
    getSupportedColumnTypes(): SteedosColumnType[];
    find(tableName: string, query: SteedosQueryOptions, userId?: SteedosIDType): any;
    findOne(tableName: string, id: SteedosIDType, query: SteedosQueryOptions, userId?: SteedosIDType): any;
    insert(tableName: string, doc: JsonMap, userId?: SteedosIDType): any;
    update(tableName: string, id: SteedosIDType, doc: JsonMap, userId?: SteedosIDType): any;
    delete(tableName: string, id: SteedosIDType, userId?: SteedosIDType): any;
    count(tableName: string, query: SteedosQueryOptions, userId?: SteedosIDType): any;
    dropEntities?(): any;
    registerEntities?(objects: Dictionary<SteedosObjectType>): any;
}

