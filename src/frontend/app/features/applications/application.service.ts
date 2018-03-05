import { Injectable } from '@angular/core';
import { Store } from '@ngrx/store';
import { schema } from 'normalizr';
import { Observable } from 'rxjs/Observable';
import { map, mergeMap, filter } from 'rxjs/operators';

import { EntityService } from '../../core/entity-service';
import { EntityServiceFactory } from '../../core/entity-service-factory.service';
import {
  ApplicationStateData,
  ApplicationStateService,
} from '../../shared/components/application-state/application-state.service';
import { PaginationMonitor } from '../../shared/monitors/pagination-monitor';
import { PaginationMonitorFactory } from '../../shared/monitors/pagination-monitor.factory';
import {
  AppMetadataTypes,
  GetAppEnvVarsAction,
  GetAppStatsAction,
  GetAppSummaryAction,
} from '../../store/actions/app-metadata.actions';
import { GetApplication, UpdateApplication, UpdateExistingApplication } from '../../store/actions/application.actions';
import { AppState } from '../../store/app-state';
import { entityFactory, routeSchemaKey, stackSchemaKey, domainSchemaKey } from '../../store/helpers/entity-factory';
import {
  appEnvVarsSchemaKey,
  applicationSchemaKey,
  appStatsSchemaKey,
  appSummarySchemaKey,
  spaceSchemaKey,
  organisationSchemaKey,
} from '../../store/helpers/entity-factory';
import { ActionState, rootUpdatingKey } from '../../store/reducers/api-request-reducer/types';
import { selectEntity, selectUpdateInfo } from '../../store/selectors/api.selectors';
import { endpointEntitiesSelector } from '../../store/selectors/endpoint.selectors';
import { APIResource, EntityInfo } from '../../store/types/api.types';
import { AppStat, AppSummary } from '../../store/types/app-metadata.types';
import { PaginationEntityState } from '../../store/types/pagination.types';
import {
  getCurrentPageRequestInfo,
  getPaginationObservables,
  PaginationObservables,
} from './../../store/reducers/pagination-reducer/pagination-reducer.helper';
import {
  ApplicationEnvVarsService,
  EnvVarStratosProject,
} from './application/application-tabs-base/tabs/build-tab/application-env-vars.service';
import { getRoute, isTCPRoute } from './routes/routes.helper';
import { generateEntityRelationKey } from '../../store/helpers/entity-relations.helpers';

export function createGetApplicationAction(guid: string, endpointGuid: string) {
  return new GetApplication(
    guid,
    endpointGuid, [
      generateEntityRelationKey(applicationSchemaKey, routeSchemaKey),
      generateEntityRelationKey(applicationSchemaKey, spaceSchemaKey),
      generateEntityRelationKey(applicationSchemaKey, stackSchemaKey),
      generateEntityRelationKey(routeSchemaKey, domainSchemaKey),
      generateEntityRelationKey(spaceSchemaKey, domainSchemaKey),
    ]
  );
}

export interface ApplicationData {
  fetching: boolean;
  app: EntityInfo;
  stack: EntityInfo;
  cf: any;
  appUrl: string;
}

@Injectable()
export class ApplicationService {

  private appEntityService: EntityService;
  private appSummaryEntityService: EntityService;

  constructor(
    public cfGuid: string,
    public appGuid: string,
    private store: Store<AppState>,
    private entityServiceFactory: EntityServiceFactory,
    private appStateService: ApplicationStateService,
    private appEnvVarsService: ApplicationEnvVarsService,
    private paginationMonitorFactory: PaginationMonitorFactory
  ) {

    this.appEntityService = this.entityServiceFactory.create(
      applicationSchemaKey,
      entityFactory(applicationSchemaKey),
      appGuid,
      createGetApplicationAction(appGuid, cfGuid),
      true
    );

    this.appSummaryEntityService = this.entityServiceFactory.create(
      appSummarySchemaKey,
      entityFactory(appSummarySchemaKey),
      appGuid,
      new GetAppSummaryAction(appGuid, cfGuid));

    this.constructCoreObservables();
    this.constructAmalgamatedObservables();
    this.constructStatusObservables();
  }

  // NJ: This needs to be cleaned up. So much going on!
  isFetchingApp$: Observable<boolean>;
  isUpdatingApp$: Observable<boolean>;

  isDeletingApp$: Observable<boolean>;

  isFetchingEnvVars$: Observable<boolean>;
  isUpdatingEnvVars$: Observable<boolean>;
  isFetchingStats$: Observable<boolean>;

  app$: Observable<EntityInfo>;
  waitForAppEntity$: Observable<EntityInfo>;
  appSummary$: Observable<EntityInfo<AppSummary>>;
  appStats$: Observable<APIResource<AppStat>[]>;
  private appStatsFetching$: Observable<PaginationEntityState>; // Use isFetchingStats$ which is properly gated
  appEnvVars: PaginationObservables<APIResource>;
  appOrg$: Observable<APIResource<any>>;
  appSpace$: Observable<APIResource<any>>;

  application$: Observable<ApplicationData>;
  applicationStratProject$: Observable<EnvVarStratosProject>;
  applicationState$: Observable<ApplicationStateData>;

  /**
   * Fetch the current state of the app (given it's instances) as an object ready
   *
   * @static
   * @param {Store<AppState>} store
   * @param {ApplicationStateService} appStateService
   * @param {any} app
   * @param {string} appGuid
   * @param {string} cfGuid
   * @returns {Observable<ApplicationStateData>}
   * @memberof ApplicationService
   */
  static getApplicationState(
    store: Store<AppState>,
    appStateService: ApplicationStateService,
    app,
    appGuid: string,
    cfGuid: string): Observable<ApplicationStateData> {
    const dummyAction = new GetAppStatsAction(appGuid, cfGuid);
    const paginationMonitor = new PaginationMonitor(
      store,
      dummyAction.paginationKey,
      entityFactory(appStatsSchemaKey)
    );
    return paginationMonitor.currentPage$.pipe(
      map(appInstancesPages => {
        const appInstances = [].concat.apply([], Object.values(appInstancesPages))
          .filter(apiResource => !!apiResource)
          .map(apiResource => {
            return apiResource.entity;
          });
        return appStateService.get(app, appInstances);
      })
    ).shareReplay(1);
  }

  private constructCoreObservables() {
    // First set up all the base observables
    this.appEntityService.entityObs$.do(entityOb => console.log(this.appGuid + ' - entityObs', entityOb.entityRequestInfo.updating[rootUpdatingKey])).subscribe();
    this.appEntityService.waitForEntity$.do(entityOb => console.log(this.appGuid + ' - waitForEntity', entityOb.entityRequestInfo.updating[rootUpdatingKey])).subscribe();



    this.app$ = this.appEntityService.waitForEntity$;

    // App org and space
    this.app$
      .filter(entityInfo => entityInfo.entity && entityInfo.entity.entity && entityInfo.entity.entity.cfGuid)
      .map(entityInfo => entityInfo.entity.entity)
      .do(app => {
        this.appSpace$ = this.store.select(selectEntity(spaceSchemaKey, app.space_guid));
        this.appOrg$ = this.appSpace$.pipe(
          filter(space => !!space),
          map(space => space.entity.organization_guid),
          mergeMap(orgGuid => {
            return this.store.select(selectEntity(organisationSchemaKey, orgGuid));
          })
        );
      })
      .take(1)
      .subscribe();

    this.isDeletingApp$ = this.appEntityService.isDeletingEntity$.shareReplay(1);

    this.waitForAppEntity$ = this.appEntityService.waitForEntity$.shareReplay(1);

    this.appSummary$ = this.waitForAppEntity$.switchMap(() => this.appSummaryEntityService.entityObs$).shareReplay(1);
    const action = new GetAppEnvVarsAction(this.appGuid, this.cfGuid);
    this.appEnvVars = getPaginationObservables<APIResource>({
      store: this.store,
      action,
      paginationMonitor: this.paginationMonitorFactory.create(
        action.paginationKey,
        entityFactory(appEnvVarsSchemaKey)
      )
    }, true);
  }

  private constructAmalgamatedObservables() {
    // Assign/Amalgamate them to public properties (with mangling if required)
    const action = new GetAppStatsAction(this.appGuid, this.cfGuid);
    const appStats = getPaginationObservables<APIResource<AppStat>>({
      store: this.store,
      action,
      paginationMonitor: this.paginationMonitorFactory.create(
        action.paginationKey,
        entityFactory(appStatsSchemaKey)
      )
    }, true);
    // This will fail to fetch the app stats if the current app is not running but we're
    // willing to do this to speed up the initial fetch for a running application.
    this.appStats$ = appStats.entities$;

    this.appStatsFetching$ = appStats.pagination$.shareReplay(1);

    this.application$ = this.waitForAppEntity$
      .combineLatest(
        this.store.select(endpointEntitiesSelector),
    )
      .filter(([{ entity, entityRequestInfo }, endpoints]: [EntityInfo, any]) => {
        return entity && entity.entity && entity.entity.cfGuid;
      })
      .map(([{ entity, entityRequestInfo }, endpoints]: [EntityInfo, any]): ApplicationData => {
        return {
          fetching: entityRequestInfo.fetching,
          app: entity,
          stack: entity.entity.stack,
          cf: endpoints[entity.entity.cfGuid],
          appUrl: this.getAppUrl(entity)
        };
      }).shareReplay(1);

    this.applicationState$ = this.waitForAppEntity$
      .combineLatest(this.appStats$.startWith(null))
      .map(([appInfo, appStatsArray]: [EntityInfo, APIResource<AppStat>[]]) => {
        return this.appStateService.get(appInfo.entity.entity, appStatsArray ? appStatsArray.map(apiResource => apiResource.entity) : null);
      }).shareReplay(1);

    this.applicationStratProject$ = this.appEnvVars.entities$.map(applicationEnvVars => {
      return this.appEnvVarsService.FetchStratosProject(applicationEnvVars[0].entity);
    }).shareReplay(1);
  }

  private constructStatusObservables() {
    /**
     * An observable based on the core application entity
    */
    this.isFetchingApp$ = this.appEntityService.isFetchingEntity$;


    this.isUpdatingApp$ =
      this.app$.map(a => {
        const updatingRoot = a.entityRequestInfo.updating[rootUpdatingKey] || {
          busy: false
        };
        const updatingSection = a.entityRequestInfo.updating[UpdateExistingApplication.updateKey] || {
          busy: false
        };
        return updatingRoot.busy || updatingSection.busy || false;
      });

    this.isFetchingEnvVars$ = this.appEnvVars.pagination$.map(ev => getCurrentPageRequestInfo(ev).busy).startWith(false).shareReplay(1);

    this.isUpdatingEnvVars$ = this.appEnvVars.pagination$.map(
      ev => getCurrentPageRequestInfo(ev).busy && ev.ids[ev.currentPage]
    ).startWith(false).shareReplay(1);

    this.isFetchingStats$ = this.appStatsFetching$.map(
      appStats => appStats ? getCurrentPageRequestInfo(appStats).busy : false
    ).startWith(false).shareReplay(1);
  }

  getAppUrl(app: EntityInfo): string {
    if (!app.entity.routes) {
      return null;
    }
    const nonTCPRoutes = app.entity.routes.filter(p => !isTCPRoute(p));
    if (nonTCPRoutes.length > 0) {
      return getRoute(
        nonTCPRoutes[0],
        true,
        false,
        nonTCPRoutes[0].entity.domain
      );
    }
    return null;
  }

  isEntityComplete(value, requestInfo: { fetching: boolean }): boolean {
    if (requestInfo) {
      return !requestInfo.fetching;
    } else {
      return !!value;
    }
  }

  /*
  * Update an application
  */
  updateApplication(updatedApplication: UpdateApplication, updateEntities?: AppMetadataTypes[]): Observable<ActionState> {
    this.store.dispatch(new UpdateExistingApplication(
      this.appGuid,
      this.cfGuid,
      { ...updatedApplication },
      updateEntities
    ));

    // Create an Observable that can be used to determine when the update completed
    const actionState = selectUpdateInfo(applicationSchemaKey,
      this.appGuid,
      UpdateExistingApplication.updateKey);
    return this.store.select(actionState).filter(item => !item.busy);
  }
}
