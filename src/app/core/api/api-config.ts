import { InjectionToken } from '@angular/core';

export interface IApiConfig {
    /** Базовый адрес API. Берётся из environment, в коде адресов нет. */
    baseUrl: string;
    debounceTime: number;
    messageLifeTime: number;
}

export const API_CONFIG = new InjectionToken<IApiConfig>('API_CONFIG');
