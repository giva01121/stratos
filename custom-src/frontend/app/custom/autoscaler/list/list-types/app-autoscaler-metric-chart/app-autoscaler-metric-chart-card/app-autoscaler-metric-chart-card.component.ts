import { Component, OnInit } from '@angular/core';
import { Store } from '@ngrx/store';
import { Observable } from 'rxjs';
import { filter } from 'rxjs/operators';

import { AppState } from '../../../../../../../../store/src/app-state';
import { entityFactory } from '../../../../../../../../store/src/helpers/entity-factory';
import {
  getPaginationObservables,
} from '../../../../../../../../store/src/reducers/pagination-reducer/pagination-reducer.helper';
import { APIResource } from '../../../../../../../../store/src/types/api.types';
import { ApplicationService } from '../../../../../../features/applications/application.service';
import { CardCell, IListRowCell } from '../../../../../../shared/components/list/list.types';
import { PaginationMonitorFactory } from '../../../../../../shared/monitors/pagination-monitor.factory';
import { AutoscalerPaginationParams, GetAppAutoscalerAppMetricAction } from '../../../../app-autoscaler.actions';
import { AppScalingTrigger, AppAutoscalerMetricData, AppAutoscalerMetricDataPoint } from '../../../../app-autoscaler.types';
import { buildLegendData, AutoscalerConstants } from '../../../../autoscaler-helpers/autoscaler-util';
import { appAutoscalerAppMetricSchemaKey } from '../../../../autoscaler.store.module';

@Component({
  selector: 'app-app-autoscaler-metric-chart-card',
  templateUrl: './app-autoscaler-metric-chart-card.component.html',
  styleUrls: ['./app-autoscaler-metric-chart-card.component.scss']
})

export class AppAutoscalerMetricChartCardComponent extends CardCell<APIResource<any>> implements OnInit, IListRowCell {
  static columns = 1;
  listData: {
    label: string;
    data$: Observable<string>;
    customStyle?: string;
  }[];

  envVarUrl: string;

  comboBarScheme = {
    name: 'singleLightBlue',
    selectable: true,
    group: 'Ordinal',
    domain: ['#01579b']
  };
  lineChartScheme = {
    name: 'coolthree',
    selectable: true,
    group: 'Ordinal',
    domain: ['#01579b']
  };

  public current = (new Date()).getTime();
  public paramsMetrics: AutoscalerPaginationParams = {
    'start-time': this.current - 30 * 60 * 1000 + '000000',
    'end-time': this.current + '000000',
    page: '1',
    'results-per-page': '10000000',
    'order-direction': 'asc'
  };
  public metricType: string;

  constructor(
    private appService: ApplicationService,
    private store: Store<AppState>,
    private paginationMonitorFactory: PaginationMonitorFactory,
  ) {
    super();
  }

  public metricData$: Observable<any>;
  public appAutoscalerAppMetricLegend;

  getLegend2(trigger: AppScalingTrigger) {
    const legendColor = buildLegendData(trigger);
    const legendValue: AppAutoscalerMetricDataPoint[] = [];
    legendColor.map((item) => {
      legendValue.push({
        name: item.name,
        value: 1
      });
    });
    return {
      legendValue,
      legendColor
    };
  }

  ngOnInit(): void {
    if (this.row.entity.query && this.row.entity.query.params) {
      this.paramsMetrics['start-time'] = this.row.entity.query.params.start + '000000000';
      this.paramsMetrics['end-time'] = this.row.entity.query.params.end + '000000000';
    }
    this.appAutoscalerAppMetricLegend = this.getLegend2(this.row.entity);
    this.metricType = AutoscalerConstants.getMetricFromMetricId(this.row.metadata.guid);
    this.metricData$ = this.getAppMetric(this.metricType, this.row.entity, this.paramsMetrics);
  }

  getAppMetric(metricName: string, trigger: any, params: any): Observable<AppAutoscalerMetricData[]> {
    const action = new GetAppAutoscalerAppMetricAction(this.appService.appGuid,
      this.appService.cfGuid, metricName, false, trigger, params);
    this.store.dispatch(action);
    return getPaginationObservables<AppAutoscalerMetricData>({
      store: this.store,
      action,
      paginationMonitor: this.paginationMonitorFactory.create(
        action.paginationKey,
        entityFactory(appAutoscalerAppMetricSchemaKey)
      )
    }, false).entities$.pipe(
      filter(entities => !!entities)
    );
  }

}
