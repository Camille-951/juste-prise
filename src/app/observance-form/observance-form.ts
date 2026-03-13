import { Component, effect, signal, untracked } from '@angular/core';
import { form, FormField } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { provideNativeDateAdapter, MAT_DATE_LOCALE } from '@angular/material/core';
import { PercentPipe } from '@angular/common';

interface PosologieData {
  doseNumber: number | null;
  doseLines: DoseLine[];
  rythm: Rythme;
  dates: {
    dispensation: Date | null;
    retour: Date | null;
    debutCycle: Date | null;
  }
}

interface DoseLine {
  id : number;
  dosePerUnit: number;
  unitPerDay: number;
  dispensed: number | null;
  returned: number | null;
}

interface Rythme {
  mode: 'continu' | 'discontinu';
  traitement: number | null;
  pause: number | null;
  weekEnd: boolean;
}

@Component({
  selector: 'app-observance-form',
  imports: [FormField, MatButtonModule, MatDatepickerModule, MatFormFieldModule, MatInputModule, PercentPipe],
  providers: [provideNativeDateAdapter(), { provide: MAT_DATE_LOCALE, useValue: 'fr-FR'}],
  templateUrl: './observance-form.html',
  styleUrl: './observance-form.scss',
})
export class ObservanceForm {

   posologieModel = signal<PosologieData>({
    doseNumber: null,
    doseLines: [],
    rythm: {
      mode: 'continu',
      weekEnd: false,
      traitement: null,
      pause: null
    },
    dates: {
      dispensation: null,
      retour: null,
      debutCycle: null
    }
  });

  posologieForm = form(this.posologieModel);

  constructor() {
    effect(() => {
      const rawTarget = Number(this.posologieForm.doseNumber().value() || 0);
      const targetNumber = Math.min(rawTarget, 20); // Nombre max de lignes
      const currentLines = untracked(() => this.posologieModel().doseLines);

      if(targetNumber < 0 || targetNumber === currentLines.length) {
        return;
      }

      let newLines = [...currentLines];

      if (targetNumber > currentLines.length) {
        const diff = targetNumber - currentLines.length;

              for (let i = 0; i < diff; i++) {
                newLines.push({
                  id: Date.now() + i,
                  dosePerUnit: 0,
                  unitPerDay: 0,
                  dispensed: null,
                  returned: null,
                });
              }
      }else if (targetNumber < currentLines.length) {
        newLines = currentLines.slice(0, targetNumber);
      }

      this.posologieModel.update(model => ({
        ...model,
        doseNumber: targetNumber,
        doseLines: newLines
      }));
    }, {allowSignalWrites: true});
  }

  printValues(): void {
    console.log(this.posologieModel());
  }

  getObservance(index: number): number | null {
    const model = this.posologieModel();
    const line = model.doseLines[index];
    const dates = model.dates;

    if (!dates.dispensation || !dates.retour || line.dispensed === null || line.returned === null || !line.unitPerDay) {
      return null;
    }

    // Calcul du nombre de jours entre dispensation et retour
    const diffTime = dates.retour.getTime() - dates.dispensation.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays <= 0) return null;

    // Calcul de base (continu)
    const theorique = diffDays * line.unitPerDay;
    const reelle = line.dispensed - line.returned;

    return reelle / theorique;
  }
  
}
