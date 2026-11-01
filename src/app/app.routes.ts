import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./features/cert-command-center/cert-command-center.component').then(
        (m) => m.CertCommandCenterComponent
      ),
  },
  {
    path: '**',
    redirectTo: '',
  },
];
