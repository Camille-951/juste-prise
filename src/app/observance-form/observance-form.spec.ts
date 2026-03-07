import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ObservanceForm } from './observance-form';

describe('ObservanceForm', () => {
  let component: ObservanceForm;
  let fixture: ComponentFixture<ObservanceForm>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ObservanceForm],
    }).compileComponents();

    fixture = TestBed.createComponent(ObservanceForm);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
