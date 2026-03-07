import { Component, signal } from '@angular/core';
import { Navbar } from "./navbar/navbar";
import { ObservanceForm } from "./observance-form/observance-form";

@Component({
  selector: 'app-root',
  imports: [ Navbar, ObservanceForm],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  protected readonly title = signal('juste-prise');
}
