import { SteedosFieldSummaryTypeConfig, SteedosSummaryTypeValue, SteedosSummaryDataTypeValue, SupportedSummaryFieldTypes } from './type';
import { isFormulaFieldQuotingObjectAndFields } from '../formula/core';
import _ = require('lodash')
const clone = require('clone')

export * from './type'

// TODO
const isCodeObject = (objectApiName) => {
    return objectApiName ? false : true
}

export class SummaryActionHandler {
    broker: any = null;
    constructor(broker) {
        this.broker = broker;
    }

    async getObjectConfig(objectApiName: string) {
        const data = await this.broker.call('objects.get', { objectApiName: objectApiName })
        return data ? data.metadata : null;
    }

    /**
     * 校验summaryConfig合法性并设置其reference_to_field、data_type属性值
     * 因为getObjectConfigs拿到的对象肯定不包括被禁用和假删除的对象，所以不需要额外判断相关状态
     * @param summaryConfig 
     */
    async initSummaryConfig(summaryConfig: SteedosFieldSummaryTypeConfig) {
        const { summary_object, field_name, object_name } = summaryConfig;
        let summaryObject = await this.getObjectConfig(summary_object);
        if (!summaryObject) {
            // 如果不是零代码对象，直接报错，否则直接返回，待相关零代码对象加载进来时，会再进入该函数
            if (isCodeObject(summary_object)) {
                throw new Error(`The summary_object '${summary_object}' of the field '${field_name}' on the object '${object_name}' is not found in the default datasource.`);
            }
            else {
                return;
            }
        }

        const referenceToField = _.find(summaryObject.fields, (item) => {
            return item.type === "master_detail" && item.reference_to === object_name;
        });
        if (!referenceToField) {
            throw new Error(`Can't fount a master_detail type field that reference_to the master object '${object_name}' on the summary_object '${summary_object}'.`);
        }
        summaryConfig.reference_to_field = referenceToField.name;
        if (!summaryConfig.data_type) {
            throw new Error(`Invalid field type summary '${field_name}' on the object '${object_name}', miss data_type property.`);
        }
        const dataType = await this.getSummaryDataType(summaryConfig, summaryObject);
        if (dataType !== summaryConfig.data_type) {
            throw new Error(`The data_type of the summary field '${field_name}' on the object '${object_name}' is incorrect, it should be '${dataType}' but is set to '${summaryConfig.data_type}'.`);
        }
        summaryConfig.data_type = dataType;
    }

    async getSummaryDataType(summaryConfig: SteedosFieldSummaryTypeConfig, summaryObject: any) {
        const { summary_object, summary_type, summary_field, field_name, object_name } = summaryConfig;
        let result: SteedosSummaryDataTypeValue;
        let needSummaryField = true;
        if (summary_type === SteedosSummaryTypeValue.COUNT) {
            // 如果是COUNT类型，则忽然掉要聚合的字段
            needSummaryField = false;
        }
        else if (!summary_field) {
            throw new Error(`You have to set a summary_field property for the field '${field_name}' of the object '${object_name}' when the summary_type is not set to 'count'.`);
        }
        if (summary_field && needSummaryField) {
            const field = summaryObject.fields[summary_field];
            if (field) {
                let fieldType = field.type;
                if (fieldType === "formula") {
                    // 要聚合的是公式，则其数据类型为公式字段的数据类型
                    // 因公式字段可能再引用当前汇总字段，所以要判断下不允许互相引用
                    fieldType = field.data_type;
                    const isQuotingTwoWay = await isFormulaFieldQuotingObjectAndFields(summary_object, summary_field, object_name, [field_name]);
                    if (isQuotingTwoWay) {
                        throw new Error(`Do not refer to each other, the field '${field_name}' of the master object '${object_name}' is summarizing a formula type summary_field '${summary_field}' of the detail object '${summary_object}', but the formula type field of the detail object exactly quoting the field of the master object, which is not allowed.`);
                    }
                }
                if (fieldType === "summary") {
                    // 要聚合的是汇总字段，则其数据类型为汇总字段的数据类型
                    // 因两个对象之前不可能互为子表关系，所以汇总字段不存在互为汇总聚合关系，不需要进一步判断它们是否互相引用
                    fieldType = field.data_type;
                }
                if (!this.isSummaryFieldTypeSupported(summary_type, fieldType)) {
                    throw new Error(`The summary data_type '${fieldType}' on the field '${field_name}' of the object '${object_name}' is not supported for the summary_type '${summary_type}' which only support these types: ${SupportedSummaryFieldTypes[summary_type]}.`);
                }
                result = <SteedosSummaryDataTypeValue>fieldType;
            }
            else {
                throw new Error(`The summary_field '${summary_field}' is not a field of the summary_object '${summary_object}'.`);
            }
        }
        else {
            result = SteedosSummaryDataTypeValue.Number;
        }
        return result;
    }

    isSummaryFieldTypeSupported(summaryType: string, summaryFieldType: string) {
        return !!(SupportedSummaryFieldTypes[summaryType] && SupportedSummaryFieldTypes[summaryType].indexOf(summaryFieldType) > -1)
    }

    async getObjectFieldSummaryConfig(fieldConfig: any, objectConfig: any) {
        let summaryConfig: SteedosFieldSummaryTypeConfig = {
            _id: `${objectConfig.name}.${fieldConfig.name}`,
            object_name: objectConfig.name,
            field_name: fieldConfig.name,
            summary_object: fieldConfig.summary_object,
            summary_type: <SteedosSummaryTypeValue>fieldConfig.summary_type,
            data_type: fieldConfig.data_type,
            summary_field: fieldConfig.summary_field,
            summary_filters: fieldConfig.summary_filters
        };
        await this.initSummaryConfig(summaryConfig);
        return summaryConfig;
    }

    async getObjectFieldsSummaryConfig(config: any, datasource: string) {
        const configs = [];
        for await (const field of _.values(config.fields)) {
            if (field.type === "summary") {
                if (datasource !== "default") {
                    throw new Error(`The type of the field '${field.name}' on the object '${config.name}' can't be 'summary', because it is not in the default datasource.`);
                }
                try {
                    // 这里一定要加try catch，否则某个字段报错后，后续其他字段及其他对象就再也没有正常加载了
                    const fieldSummaryConfig = await this.getObjectFieldSummaryConfig(clone(field), config)
                    configs.push(fieldSummaryConfig);
                } catch (error) {
                    console.error(error);
                }
            }
        }
        
        return configs;
    }


    /* metadata 新增 */

    cacherKey(APIName: string): string{
        return `$steedos.#summary.${APIName}`
    }

    async addSummaryMetadata(config: any, datasource: string){
        const fieldsSummaryConfig = await this.getObjectFieldsSummaryConfig(config, datasource);
        for await (const fieldSummary of fieldsSummaryConfig) {
            await this.broker.call('metadata.add', {key: this.cacherKey(fieldSummary._id), data: fieldSummary}, {meta: {}})
        }
        return true;
    }

    async add(ctx){
        const { data } = ctx.params;
        return await this.addSummaryMetadata(data, data.datasource);
    }

    async filter(ctx){
        let {objectApiName, fieldApiName} = ctx.params;
        if(!objectApiName){
            objectApiName = "*";
        }
        if(!fieldApiName){
            fieldApiName = "*";
        }
        const key = this.cacherKey(`${objectApiName}.${fieldApiName}`)
        const configs = [];
        const res = await this.broker.call('metadata.filter', {key: key}, {meta: {}})
        _.forEach(res, (item)=>{
            configs.push(item.metadata)
        })
        return configs;
    }

    async get(ctx){
        let {fieldApiFullName} = ctx.params; 
        const key = this.cacherKey(fieldApiFullName)
        const res = await this.broker.call('metadata.get', {key: key}, {meta: {}})
        return res?.metadata
    }
}