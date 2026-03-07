import { Component, effect, signal, untracked } from '@angular/core';
import { form, FormField } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';

interface PosologieData {
  doseNumber: number;
  doseLines: DoseLine[];
  rythm: Rythme;
}

interface DoseLine {
  id : number;
  dosePerUnit: number;
  unitPerDay: number;
}

interface Rythme {
  mode: 'continu' | 'discontinu';
  traitement: number | null;
  pause: number | null;
  weekEnd: boolean;
}

@Component({
  selector: 'app-observance-form',
  imports: [FormField, MatButtonModule],
  templateUrl: './observance-form.html',
  styleUrl: './observance-form.scss',
})
export class ObservanceForm {

   posologieModel = signal<PosologieData>({
    doseNumber: 0,
    doseLines: [],
    rythm: {
      mode: 'continu',
      weekEnd: false,
      traitement: null,
      pause: null
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
                  unitPerDay: 0
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
  
}
