import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { FilteredByReturnType } from '../../../core/src/core/utils.service';
import { EntityService } from '../entity-service';
import { EntitySchema } from '../helpers/entity-schema';
import { EntityMonitor } from '../monitors/entity-monitor';
import { PaginationMonitor } from '../monitors/pagination-monitor';
import { ActionState, RequestInfoState } from '../reducers/api-request-reducer/types';
import { getCurrentPageRequestInfo, PaginationObservables } from '../reducers/pagination-reducer/pagination-reducer.types';
import { isPaginatedAction, PaginatedAction } from '../types/pagination.types';
import { RequestAction } from '../types/request.types';
import {
  BaseEntityRequestAction,
  BaseEntityRequestConfig,
  BasePaginationRequestAction,
  EntityRequestActionConfig,
  GetMultipleActionBuilder,
  KnownEntityActionBuilder,
  OrchestratedActionBuilder,
  OrchestratedActionBuilderConfig,
  OrchestratedActionBuilders,
  OrchestratedActionCoreBuilders,
  PaginationRequestActionConfig,
} from './action-orchestrator/action-orchestrator';
import { EntityCatalogHelper } from './entity-catalog.service';

// TODO: RC TIDY Have this still?
export interface EntityAccessEntity<Y> {
  entityMonitor: EntityMonitor<Y>;
  entityService: EntityService<Y>;
}
// TODO: RC TIDY Have this still?
export interface EntityAccessPagination<Y> {
  monitor: PaginationMonitor<Y>;
  obs: PaginationObservables<Y>;
}


export function createEntityApiPagination<Y>(
  helper: EntityCatalogHelper,
  action: PaginatedAction
): EntityAccessPagination<Y> {
  const mon = helper.pmf.create<Y>(
    action.paginationKey,
    action,
    action.flattenPagination
  );
  return {
    monitor: mon,
    obs: helper.getPaginationObservables<Y>({
      store: helper.store,
      action,
      paginationMonitor: mon
    }, action.flattenPagination) // TODO: RC REF This isn't always the case.
  };
}

// export type KnownKeys2<T> = {
//   [K in keyof T]: string extends K ? never : K
//   // [K in keyof T]: string extends K ? never : number extends K ? never : K
// } extends { [_ in keyof T]: infer U } ? U : never;
// extends { [_ in keyof T]: infer U } ? U : never
// export type KnownKeys2<T extends OrchestratedActionCoreBuilders> = {
//   [K in keyof Exclude<T, OrchestratedActionCoreBuilders>]: T[K]
// }
// type Without<T, K> = Pick<T, Exclude<keyof T, K>>;

// type PrimitiveKeys<T> = {
//   [P in keyof T]: Exclude<T[P], undefined> extends object ? never : P
// }[keyof T];
// type OnlyPrimitives<T> = Pick<T, PrimitiveKeys<T>>;

// type aa<ABC> = KnownKeys2<ABC>;
// const iaa: aa<UserProvidedServiceActionBuilder>;

// type ab<ABC> = Pick<ABC, aa<ABC>>; //
// type ba = KnownKeys2<OrchestratedActionCoreBuilders>;
// type c<ABC> = Omit<ab<ABC>, ba>;


/**
 * Filter out all the common builders from OrchestratedActionCoreBuilders
 */
// type CustomBuilders<ABC> = Omit<Pick<ABC, KnownKeys<ABC>>, KnownKeys<OrchestratedActionCoreBuilders>>;
// type CustomBuilders<ABC extends OrchestratedActionBuilders> =
//   Omit<Pick<ABC, KnownKeys<ABC>>, KnownKeys<OrchestratedActionBuilders>>;
// type CustomBuilders<ABC extends OrchestratedActionCoreBuilders> = Omit<ABC, keyof OrchestratedActionCoreBuilders>;

type KnownKeys2<T> = {
  [K in keyof T]: string extends K ? never : number extends K ? never : K
} extends { [_ in keyof T]: infer U } ? ({} extends U ? never : U) : never;
type aa<ABC> = KnownKeys2<ABC>;
type ab<ABC> = Pick<ABC, aa<ABC>>;

type ba = keyof OrchestratedActionCoreBuilders;

// type c = Omit<ab<UserProvidedServiceActionBuilder>, ba>;
type CustomBuilders<ABC> = Omit<ab<ABC>, ba>;

/**
 * Filter out builders that don't return pagination actions
 */
type PaginationBuilders<ABC extends OrchestratedActionBuilders> = FilteredByReturnType<CustomBuilders<ABC>, PaginatedAction>;

// const a: CustomBuilders<UserProvidedServiceActions>;

// const b: PaginationBuilders<UserProvidedServiceActions>;




export interface EntityAccess<Y, ABC extends OrchestratedActionBuilders> {
  getEntityMonitor: (
    helper: EntityCatalogHelper,
    entityId: string,
    params?: {
      schemaKey?: string,
      startWithNull?: boolean
    }
  ) => EntityMonitor<Y>;
  getEntityService: (
    helper: EntityCatalogHelper,
    ...args: Parameters<ABC['get']>
  ) => EntityService<Y>;
  getPaginationMonitor: (
    helper: EntityCatalogHelper,
    ...args: Parameters<ABC['getMultiple']>
  ) => PaginationMonitor<Y>;
  getPaginationService: (
    helper: EntityCatalogHelper,
    ...args: Parameters<ABC['getMultiple']>
  ) => PaginationObservables<Y>;
  instances: EntityInstances<Y, PaginationBuilders<ABC>>;
}

// TODO: RC TIDY THIS WHOLE MESS
// K extends keyof ABC
type ActionDispatcher<K extends keyof ABC, ABC extends OrchestratedActionBuilders> = (
  ech: EntityCatalogHelper,
  ...args: Parameters<ABC[K]>
) => Observable<RequestInfoState | ActionState>;
export type ActionDispatchers<ABC extends OrchestratedActionBuilders> = {
  [K in keyof ABC]: ActionDispatcher<K, ABC>
};


export type EntityInstances<Y, ABC extends OrchestratedActionBuilders> = {
  [K in keyof ABC]: ABC[K] extends never ?
  never : {
    getPaginationMonitor: (
      helper: EntityCatalogHelper,
      ...args: Parameters<ABC[K]>
    ) => PaginationMonitor<Y>;
    getPaginationService: (
      helper: EntityCatalogHelper,
      ...args: Parameters<ABC[K]>
    ) => PaginationObservables<Y>;
  }
};



export class ActionBuilderConfigMapper {

  static actionKeyHttpMethodMapper = {
    get: 'GET',
    getMultiple: 'GET',
    create: 'POST',
    remove: 'DELETE',
    update: 'PUT'
  };

  static getEntityInstances<Y, ABC extends OrchestratedActionBuilders, K extends keyof ABC>(
    builders: ABC,
  ): EntityInstances<Y, PaginationBuilders<ABC>> {
    if (!builders) {
      return {} as EntityInstances<Y, ABC>;
    }
    return Object.keys(builders).reduce((entityInstances, key) => {
      return {
        ...entityInstances,
        [key]: {
          getPaginationMonitor: (
            helper: EntityCatalogHelper,
            ...args: Parameters<ABC[K]>
          ) => {
            const action = builders[key](...args);
            if (!isPaginatedAction(action)) {
              throw new Error(`\`${key}\` action is not of type pagination`);
            }
            const pAction = action as PaginatedAction;
            return helper.pmf.create<Y>(pAction.paginationKey, pAction, pAction.flattenPagination);
          },
          getPaginationService: (
            helper: EntityCatalogHelper,
            ...args: Parameters<ABC[K]>
          ) => {
            const action = builders[key](...args);
            if (!isPaginatedAction(action)) {
              throw new Error(`\`${key}\` action is not of type pagination`);
            }
            const pAction = action as PaginatedAction;
            return helper.getPaginationObservables<Y>({
              store: helper.store,
              action: pAction,
              paginationMonitor: helper.pmf.create<Y>(
                pAction.paginationKey,
                pAction,
                pAction.flattenPagination
              )
            }, pAction.flattenPagination);  // TODO: RC REF This isn't always the case.
          }
        }
      };
    }, {} as EntityInstances<Y, PaginationBuilders<ABC>>);
  }

  static getActionDispatchers<Y, ABC extends OrchestratedActionBuilders>(
    es: EntityAccess<Y, ABC>,
    builders: ABC,
  ): ActionDispatchers<ABC> {
    if (!builders) {
      return {} as ActionDispatchers<ABC>;
    }
    return Object.keys(builders).reduce((actionDispatchers, key) => {
      return {
        ...actionDispatchers,
        [key]: ActionBuilderConfigMapper.getActionDispatcher(
          es,
          builders[key],
          key
        )
      };
    }, {} as ActionDispatchers<ABC>);
  }

  static getActionDispatcher<Y, ABC extends OrchestratedActionBuilders, K extends keyof ABC>(
    es: EntityAccess<Y, ABC>,
    builder: OrchestratedActionBuilder, // TODO: RC support | OrchestratedActionBuilderConfig
    actionKey: string,
  ): ActionDispatcher<K, ABC> {
    return (
      ech: EntityCatalogHelper,
      ...args: Parameters<ABC[K]>) => {
      const action = builder(...args);
      ech.store.dispatch(action);
      if (isPaginatedAction(action)) {
        const pagObs = es.instances[actionKey] as unknown as EntityAccessPagination<Y>;
        return pagObs.monitor.pagination$.pipe(map(p => getCurrentPageRequestInfo(p)));
      }
      const rAction = action as RequestAction;
      return es.getEntityMonitor(
        ech,
        rAction.guid,
        {
          schemaKey: rAction.entity[0] || rAction.entity,
          startWithNull: true
        }
      ).entityRequest$;
    };
  }

  static getActionBuilders(
    builders: OrchestratedActionBuilders | OrchestratedActionBuilderConfig,
    endpointType: string,
    entityType: string,
    schemaGetter: (schemaKey: string) => EntitySchema
  ): OrchestratedActionBuilders {
    if (!builders) {
      return {};
    }
    return Object.keys(builders).reduce((actionBuilders, key) => {
      return {
        ...actionBuilders,
        [key]: ActionBuilderConfigMapper.getActionBuilder(builders[key], key, endpointType, entityType, schemaGetter)
      };
    }, {} as OrchestratedActionBuilders);
  }

  static getActionBuilder(
    configOrBuilder: OrchestratedActionBuilder |
      EntityRequestActionConfig<OrchestratedActionBuilder> |
      PaginationRequestActionConfig<OrchestratedActionBuilder>,
    actionKey: string,
    endpointType: string,
    entityType: string,
    schemaGetter: (schemaKey: string) => EntitySchema
  ): OrchestratedActionBuilder {
    if (configOrBuilder instanceof EntityRequestActionConfig) {
      return (...args: Parameters<KnownEntityActionBuilder>) => {
        const [guid, endpointGuid, ...meta] = args;
        return new BaseEntityRequestAction(
          schemaGetter(configOrBuilder.schemaKey),
          guid,
          endpointGuid,
          entityType,
          endpointType,
          configOrBuilder.getUrl(...args),
          ActionBuilderConfigMapper.addHttpMethodFromActionKey(actionKey, configOrBuilder.requestConfig),
          meta,
          configOrBuilder.externalRequest
        );
      };
    }
    if (configOrBuilder instanceof PaginationRequestActionConfig) {
      return (...args: Parameters<GetMultipleActionBuilder>) => {
        const [endpointGuid, ...meta] = args;
        return new BasePaginationRequestAction(
          schemaGetter(configOrBuilder.schemaKey),
          configOrBuilder.paginationKey || args[1],
          endpointGuid,
          entityType,
          endpointType,
          configOrBuilder.getUrl(...args),
          configOrBuilder.requestConfig,
          meta,
          !configOrBuilder.externalRequest
        );
      };
    }
    return configOrBuilder;
  }

  static addHttpMethodFromActionKey(key: string, config: BaseEntityRequestConfig): BaseEntityRequestConfig {
    return {
      ...config,
      // The passed httpMethod takes precedence when we're mapping the update action.
      // This is because some apis might use POST for updates.
      httpMethod: key === 'update' ? config.httpMethod || ActionBuilderConfigMapper.actionKeyHttpMethodMapper[key] :
        ActionBuilderConfigMapper.actionKeyHttpMethodMapper[key] || config.httpMethod,
    };
  }
}

// type hmm<R extends PaginatedAction> = (any) => R;
// type Phase2<ABC> = FilterFlags<Phase1<ABC>>;

// type FilterFlags<Base extends { [key: string]: () => any }> = {
//   [Key in keyof Base]: ReturnType<Base[Key]> extends PaginatedAction ? Base[Key] : never
// };
// type PrimitiveKeys<T> = {
//   [P in keyof T]: Exclude<T[P], never> extends object ? never : P
// }[keyof T];
// type OnlyPrimitives<T> = Pick<T, PrimitiveKeys<T>>;

// type Phase31 = PrimitiveKeys<Phase2<UserProvidedServiceActionBuilder>>;
// type Phase32 = OnlyPrimitives<Phase2<UserProvidedServiceActionBuilder>>;

// type Test1 = NonNullable<Phase2<UserProvidedServiceActionBuilder>>;

// type EntityInstances2<T extends { [key: string]: () => any }, U> = {
//   [P in keyof T]: ReturnType<T[P]> extends U ? P : never
// };

// interface EntityInstancesContent<Y, K extends keyof ABC, ABC extends OrchestratedActionBuilders> {

// }
// type ActionStore<K extends keyof ABC, ABC extends OrchestratedActionBuilders, Y = any> = (
//   ech: EntityCatalogHelper,
//   ...args: Parameters<ABC[K]>
// ) => EntityAccessPagination<Y> | EntityAccessEntity<Y>;
// export type ActionStores<ABC extends OrchestratedActionBuilders> = {
//   [K in keyof ABC]: ActionStore<K, ABC>
// };
