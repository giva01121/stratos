import { AppState } from '../../../../../../store/app-state';
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Observable } from 'rxjs/Rx';

import { ApplicationData, ApplicationService } from '../../../../application.service';
import { EntityInfo } from '../../../../../../store/types/api.types';
import { AppSummary } from '../../../../../../store/types/app-metadata.types';

import { Store } from '@ngrx/store';
import { ApplicationMonitorService } from '../../../../application-monitor.service';
import { Http, Headers } from '@angular/http';

@Component({
  selector: 'app-build-tab',
  templateUrl: './build-tab.component.html',
  styleUrls: ['./build-tab.component.scss'],
  providers: [
    ApplicationMonitorService,
  ]
})
export class BuildTabComponent implements OnInit {
  constructor(private http: Http, private route: ActivatedRoute, private applicationService: ApplicationService, private store: Store<AppState>) { }

  appService = this.applicationService;

  cardTwoFetching$: Observable<boolean>;

  public async: any;

  ngOnInit() {
    this.cardTwoFetching$ = this.appService.application$
      .combineLatest(
      this.appService.appSummary$
      )
      .map(([app, appSummary]: [ApplicationData, EntityInfo<AppSummary>]) => {
        return app.fetching || appSummary.entityRequestInfo.fetching;
      }).distinct();
  }

  testMetrics() {
    console.log('TESTING METRICS.....');

    const headers = new Headers({ 'x-cap-cnsi-list': this.appService.cfGuid });
    const requestArgs = {
      headers: headers
    };
    
    const metrics = this.http.get('/pp/v1/metrics/cf/app/' + this.appService.appGuid, requestArgs).subscribe();

  }  
}
