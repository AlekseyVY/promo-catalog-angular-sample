import { inject, Injectable } from '@angular/core';
import { ComponentStore } from '@ngrx/component-store';
import { tapResponse } from '@ngrx/operators';
import { BehaviorSubject, Observable, switchMap, tap } from 'rxjs';

import { NotificationService } from '../../../core/notification/notification.service';
import { IProduct, IProductListRequest, ISortOption } from '../domain/catalog.models';
import { ProductSubFilterEnum } from '../domain/product-type-filter.model';
import { CatalogApiService } from './catalog-api.service';

export enum FocusedArea {
    FILTERS = 'FILTERS',
    SEARCH = 'SEARCH',
    TABLE = 'TABLE',
    MODAL = 'MODAL',
}

export interface ICatalogState {
    productList: IProduct[] | null;
    selectedProduct: IProduct | null;
    activeSubFilter: ProductSubFilterEnum;
    sort: ISortOption;
    focusedArea: FocusedArea;
    regionId: number | null;
}

const initialState: ICatalogState = {
    productList: null,
    selectedProduct: null,
    activeSubFilter: ProductSubFilterEnum.ALL,
    sort: { attributeName: 'name', sortOrder: 'ASC' },
    focusedArea: FocusedArea.TABLE,
    regionId: null,
};

/**
 * Локальное состояние страницы каталога. Живёт ровно столько, сколько страница
 * (провайдится в компоненте-странице), поэтому не засоряет глобальный store.
 */
@Injectable()
export class CatalogStore extends ComponentStore<ICatalogState> {
    private readonly api = inject(CatalogApiService);
    private readonly notification = inject(NotificationService);

    /** Ручной лоадер: таблица показывает спиннер только на явную перезагрузку, а не на фоновые обновления. */
    public readonly productListLoading$ = new BehaviorSubject<boolean>(false);

    public readonly productList$ = this.select(state => state.productList);
    public readonly selectedProduct$ = this.select(state => state.selectedProduct);
    public readonly activeSubFilter$ = this.select(state => state.activeSubFilter);
    public readonly focusedArea$ = this.select(state => state.focusedArea);
    public readonly sort$ = this.select(state => state.sort);

    public readonly isKeyboardBlocked$ = this.select(state => state.focusedArea === FocusedArea.MODAL);

    constructor() {
        super(initialState);
    }

    public get stateSnapshot(): ICatalogState {
        return this.get();
    }

    public readonly setSelectedProduct = this.updater<IProduct | null>((state, selectedProduct) => ({ ...state, selectedProduct }));
    public readonly setActiveSubFilter = this.updater<ProductSubFilterEnum>((state, activeSubFilter) => ({ ...state, activeSubFilter }));
    public readonly setFocusedArea = this.updater<FocusedArea>((state, focusedArea) => ({ ...state, focusedArea }));
    public readonly setSort = this.updater<ISortOption>((state, sort) => ({ ...state, sort }));
    public readonly resetProductList = this.updater(state => ({ ...state, productList: null, selectedProduct: null }));

    /** switchMap: новый запрос отменяет предыдущий, ответы не приходят «вперемешку» при быстром наборе в поиске. */
    public readonly loadProductList = this.effect((request$: Observable<IProductListRequest>) =>
        request$.pipe(
            tap(() => this.productListLoading$.next(true)),
            switchMap(request =>
                this.api.getProductList(request).pipe(
                    tapResponse({
                        next: productList => {
                            const selectedId = this.get().selectedProduct?.id;
                            const selectedProduct = productList.find(product => product.id === selectedId) ?? null;

                            this.patchState({ productList, selectedProduct });
                        },
                        error: () => {
                            this.notification.error('Не удалось загрузить список товаров');
                            this.patchState({ productList: [] });
                        },
                        finalize: () => this.productListLoading$.next(false),
                    }),
                ),
            ),
        ),
    );
}
