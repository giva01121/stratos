import { AppChipsComponent } from './components/chips/chips.component';
import { NgModule } from '@angular/core';
import { BooleanIndicatorComponent } from './components/boolean-indicator/boolean-indicator.component';
import { StratosTitleComponent } from './components/stratos-title/stratos-title.component';

@NgModule({
  imports: [],
  declarations: [
    AppChipsComponent,
    BooleanIndicatorComponent,
    StratosTitleComponent,
  ],
  exports: [
    AppChipsComponent,
    BooleanIndicatorComponent,
    StratosTitleComponent,
  ]
})
export class StratosComponentsModule {

  constructor() {
    console.log('Stratos Components Module loaded');
  }
 }