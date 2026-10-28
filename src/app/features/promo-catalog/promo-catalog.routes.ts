import { inject } from '@angular/core';
import { ResolveFn, Routes } from '@angular/router';
import { of } from 'rxjs';

import { CatalogApiService } from './data-access/catalog-api.service';
import { PROMO_DICTIONARY_PROVIDERS, promoDictionariesResolver } from './dictionaries/dictionary-loading';
import { IPromo, PromoMechanic, PromoStatus } from './domain/catalog.models';

const promoResolver: ResolveFn<IPromo> = route => {
    const promoId = route.paramMap.get('promoId');

    if (promoId && promoId !== 'new') {
        return inject(CatalogApiService).getPromo(Number(promoId));
    }

    const productId = Number(route.queryParamMap.get('productId'));

    return of<IPromo>({
        id: null,
        title: '',
        mechanic: PromoMechanic.DISCOUNT_PERCENT,
        status: PromoStatus.DRAFT,
        startDate: '',
        endDate: '',
        regionIds: [],
        budget: null,
        discountValue: null,
        conditions: productId ? [{ productId, minQuantity: 1, limitPerCustomer: null }] : [],
        comment: null,
    });
};

/**
 * Все маршруты фичи грузятся лениво: таблица и редактор — отдельные чанки,
 * провайдеры справочников живут только внутри фичи.
 */
export const PROMO_CATALOG_ROUTES: Routes = [
    {
        path: '',
        providers: [...PROMO_DICTIONARY_PROVIDERS],
        children: [
            {
                path: '',
                title: 'Каталог товаров',
                loadComponent: () => import('./ui/catalog-page/catalog-page.component').then(m => m.CatalogPageComponent),
            },
            {
                path: 'promo/:promoId',
                title: 'Промо-акция',
                loadComponent: () => import('./promo-editor/promo-editor.component').then(m => m.PromoEditorComponent),
                resolve: {
                    promo: promoResolver,
                    dictionaries: promoDictionariesResolver,
                },
            },
        ],
    },
];
