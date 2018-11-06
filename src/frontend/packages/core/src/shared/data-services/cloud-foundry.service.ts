import { Injectable } from '@angular/core';
import { Store } from '@ngrx/store';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { PaginationMonitor } from '../monitors/pagination-monitor';
import { PaginationMonitorFactory } from '../monitors/pagination-monitor.factory';
import { EndpointModel } from '../../../../store/src/types/endpoint.types';
import { EntityInfo, APIResource } from '../../../../store/src/types/api.types';
import { AppState } from '../../../../store/src/app-state';
import { entityFactory, endpointSchemaKey } from '../../../../store/src/helpers/entity-factory';

@Injectable()
export class CloudFoundryService {
  static EndpointList = 'endpoint-list';
  hasRegisteredCFEndpoints$: Observable<boolean>;
  hasConnectedCFEndpoints$: Observable<boolean>;
  connectedCFEndpoints$: Observable<EndpointModel[]>;
  cFEndpoints$: Observable<EndpointModel[]>;
  cfEndpointsMonitor: PaginationMonitor<EndpointModel>;
  waitForAppEntity$: Observable<EntityInfo<APIResource>>;

  constructor(
    private store: Store<AppState>,
    private paginationMonitorFactory: PaginationMonitorFactory
  ) {

    this.cfEndpointsMonitor = new PaginationMonitor(store, CloudFoundryService.EndpointList, entityFactory(endpointSchemaKey));

    this.cFEndpoints$ = this.cfEndpointsMonitor.currentPage$.pipe(
      map(endpoints => endpoints.filter(e => e.cnsi_type === 'cf'))
    );

    this.connectedCFEndpoints$ = this.cFEndpoints$.pipe(
      map(endpoints => endpoints.filter(
        endpoint => endpoint.connectionStatus === 'connected' || endpoint.connectionStatus === 'checking'
      ))
    );

    this.hasConnectedCFEndpoints$ = this.connectedCFEndpoints$.pipe(
      map(endpoints => !!endpoints.length)
    );

    this.hasRegisteredCFEndpoints$ = this.cFEndpoints$.pipe(
      map(endpoints => !!endpoints.length)
    );
  }
}
