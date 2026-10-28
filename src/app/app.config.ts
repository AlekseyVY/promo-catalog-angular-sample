import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { ApplicationConfig } from '@angular/core';
import { provideRouter, Routes, withComponentInputBinding } from '@angular/router';

import { environment } from '../environments/environment';
import { API_CONFIG } from './core/api/api-config';

export const APP_ROUTES: Routes = [
    { path: '', pathMatch: 'full', redirectTo: 'catalog' },
    {
        path: 'catalog',
        loadChildren: () => import('./features/promo-catalog/promo-catalog.routes').then(m => m.PROMO_CATALOG_ROUTES),
    },
    { path: '**', redirectTo: 'catalog' },
];

export const appConfig: ApplicationConfig = {
    providers: [
        provideRouter(APP_ROUTES, withComponentInputBinding()),
        provideHttpClient(withInterceptorsFromDi()),
        {
            provide: API_CONFIG,
            useValue: { baseUrl: environment.apiUrl, debounceTime: 300, messageLifeTime: 3000 },
        },
    ],
};
