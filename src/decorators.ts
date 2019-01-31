import {
    DataTypes as SequelizeDataTypes,
    DefineAttributeColumnOptions,
    Models,
    DefineOptions,
    AssociationOptions,
    DefineIndexesOptions,
    AssociationOptionsHasOne,
    AssociationOptionsBelongsTo,
    AssociationOptionsHasMany,
    AssociationOptionsBelongsToMany
} from 'sequelize';
import { Sequelize } from 'sequelize';

const dtype: SequelizeDataTypes = require('sequelize').DataTypes;
export const DataType = dtype;

export interface IIndexOptions {
    /**
     * name for the index
     * if creating a compound index name is required and must match name for the index on other column
     */
    name?: string;
    unique?: boolean;
}

export function Entity(name?: string, options?: DefineOptions<any>) {
    return (target: Function) => {
        let meta = getMeta(target.prototype);

        if (typeof name == 'string') {
            meta.name = name;
        } else {
            meta.name = target.name;

            if (options == null && name != null && typeof name == 'object') {
                options = Object.assign({}, name, meta.options);
            }
        }

        meta.options = Object.assign({}, options, meta.options);

        // we will default to not having timestamp columns
        if (meta.options.createdAt == null) {
            meta.options.createdAt = false;
        }

        if (meta.options.updatedAt == null) {
            meta.options.updatedAt = false;
        }
    }
}

export function Column(attribute: DefineAttributeColumnOptions) {
    return (target: any, key: string) => {
        let meta = getMeta(target);
        meta.fields[key] = attribute;
    }
}

export function CreatedDateColumn() {
    return (target: any, key: string) => {
        let meta = getMeta(target);
        meta.options.createdAt = key;
    }
}

export function UpdatedDateColumn() {
    return (target: any, key: string) => {
        let meta = getMeta(target);
        meta.options.updatedAt = key;
    }
}

export function PrimaryGeneratedColumn() {
    return (target: any, key: string) => {
        let meta = getMeta(target);
        meta.fields[key] = {
            primaryKey: true,
            type: DataType.INTEGER,
            autoIncrement: true
        };
    }
}

export function HasOne(typeFunction: () => Function, options?: AssociationOptionsHasOne) {
    return (target: any, key: string) => {
        let meta = getMeta(target);

        if (options == null) {
            options = {};
        }

        options.as = key;

        meta.associations[key] = {
            method: AssociationMethods.HAS_ONE,
            target: typeFunction,
            association: options
        }
    }
}

export function HasMany(typeFunction: () => Function, options?: AssociationOptionsHasMany) {
    return (target: any, key: string) => {
        let meta = getMeta(target);

        if (options == null) {
            options = {};
        }

        options.as = key;

        meta.associations[key] = {
            method: AssociationMethods.HAS_MANY,
            target: typeFunction,
            association: options
        }
    }
}

export function BelongsTo(typeFunction: () => Function, options?: AssociationOptionsBelongsTo) {
    return (target: any, key: string) => {
        let meta = getMeta(target);

        if (options == null) {
            options = {};
        }

        options.as = key;

        meta.associations[key] = {
            method: AssociationMethods.BELONGS_TO,
            target: typeFunction,
            association: options
        }
    }
}

export function ManyToMany(typeFunction: () => Function, options: AssociationOptionsBelongsToMany) {
    return (target: any, key: string) => {
        let meta = getMeta(target);

        if (options == null) {
            options = {} as AssociationOptionsBelongsToMany;
        }

        if (options.through == null) {
            throw new Error('through property is required for belongs to many association')
        }

        options.as = key;

        meta.associations[key] = {
            method: AssociationMethods.BELONGS_TO_MANY,
            target: typeFunction,
            association: options
        }
    }
}

export function Index(options?: IIndexOptions) {
    return (target: any, key: string) => {
        let meta = getMeta(target);
        if (meta.options.indexes == null) {
            meta.options.indexes = [];
        }

        if (options == null) {
            options = {} as IIndexOptions;
        }

        let index: DefineIndexesOptions = null;
        if (options.name != null) {
            index = meta.options.indexes.find((i) => {
                return i.name === options.name;
            });
        }

        if (index == null) {
            index = {
                name: options.name,
                unique: options.unique,
                fields: [key]
            };
        } else {
            index.fields.push(key);
        }

        clean(index);

        meta.options.indexes.push(index);
    }
}

export function registerEntities(sequelize: Sequelize, entities: Function[]): Models {
    // define the attributes
    for (let entity of entities) {
        let e = Object.create(entity.prototype);
        let meta = getMeta(e);

        sequelize.define(meta.name, meta.fields, meta.options);
    }

    // define the associations
    for (let entity of entities) {
        let e = Object.create(entity.prototype);
        let meta = getMeta(e);

        if (meta.associations != null) {
            let model = sequelize.models[entity.name];
            if (model != null) {
                for (let assnName of Object.keys(meta.associations)) {
                    let entityAssociation = meta.associations[assnName];
                    let targetName = entityAssociation.target().name;
                    // add the include association to the model
                    (model as any)[assnName] = (model as any)[entityAssociation.method](sequelize.models[targetName], entityAssociation.association);
                }
            }
        }
    }

    return sequelize.models;
}

interface IEntity {
    name: string;
    fields: {
        [key: string]: DefineAttributeColumnOptions
    }
    associations: {
        [key: string]: IEntityAssociation;
    },
    options: DefineOptions<any>;
}

interface IEntityAssociation {
    target: Function;
    method: string;
    association: AssociationOptions
}

const AssociationMethods = {
    HAS_ONE: 'hasOne',
    BELONGS_TO: 'belongsTo',
    HAS_MANY: 'hasMany',
    BELONGS_TO_MANY: 'belongsToMany'
}

function getMeta(target: Object): IEntity {
    if (target.constructor == null) {
        throw new Error('Invalid Entity. Entities should be of type function/class.');
    }

    if ((target as any).__sequelize_meta__ == null) {
        (target as any).__sequelize_meta__ = {
            entities: []
        }
    }

    let found: IEntity = null;
    for (let entity of (target as any).__sequelize_meta__.entities) {
        let e: IEntity = entity;
        if (e.name === target.constructor.name) {
            found = e;
            break;
        }
    }

    if (found == null) {
        found = {
            name: target.constructor.name,
            associations: {},
            fields: {},
            options: {}
        };

        (target as any).__sequelize_meta__.entities.push(found);
    }

    return found;
}

function clean(obj: any) {
    for (let key of Object.keys(obj)) {
        if (obj[key] == null) delete obj[key];
    }
}