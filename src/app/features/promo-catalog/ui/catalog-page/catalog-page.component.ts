import { AsyncPipe } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, DestroyRef, HostListener, inject, OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { debounceTime, distinctUntilChanged, map, merge, Observable, startWith, Subject } from 'rxjs';

import { API_CONFIG } from '../../../../core/api/api-config';
import { CatalogStore, FocusedArea } from '../../data-access/catalog.store';
import { IProduct, IProductListRequest, ISortOption } from '../../domain/catalog.models';
import { buildProductTypeCounts, IProductTypeFilter, productTypeFilters } from '../../domain/product-type-filter.model';
import { ProductTableComponent } from '../product-table/product-table.component';

/**
 * Страница каталога: чипы-фильтры со счётчиками, быстрый поиск, таблица.
 *
 * Фильтрация двухуровневая: тяжёлые фильтры (регион, сортировка, тип) уходят на бэкенд,
 * а поиск по строке дополнительно применяется на клиенте к уже загруженному списку —
 * пользователь видит результат сразу, не дожидаясь ответа.
 */
@Component({
    selector: 'app-catalog-page',
    standalone: true,
    templateUrl: './catalog-page.component.html',
    styleUrls: ['./catalog-page.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    providers: [CatalogStore],
    imports: [AsyncPipe, ReactiveFormsModule, ProductTableComponent],
})
export class CatalogPageComponent implements OnInit {
    public readonly store = inject(CatalogStore);

    public readonly searchControl = new FormControl<string>('', { nonNullable: true });
    public readonly searchString$: Observable<string> = this.searchControl.valueChanges.pipe(
        startWith(this.searchControl.value),
        map(value => value.trim()),
    );

    public typeFilters: IProductTypeFilter[] = productTypeFilters.map(item => ({ ...item, request: { ...item.request } }));
    public activeTypeFilter: IProductTypeFilter = this.typeFilters[0];
    public focusedChipIdx = -1;

    private readonly reload$ = new Subject<void>();
    private readonly router = inject(Router);
    private readonly route = inject(ActivatedRoute);
    private readonly cd = inject(ChangeDetectorRef);
    private readonly destroyRef = inject(DestroyRef);
    private readonly debounceMs = inject(API_CONFIG).debounceTime;

    public ngOnInit(): void {
        // Любой источник изменения «шапки» сводится к одному запросу.
        merge(
            this.reload$,
            this.searchControl.valueChanges.pipe(debounceTime(this.debounceMs), map(value => value.trim()), distinctUntilChanged()),
        )
            .pipe(startWith(null), takeUntilDestroyed(this.destroyRef))
            .subscribe(() => this.store.loadProductList(this.buildRequest()));

        // Счётчики пересчитываем только по полному списку («Все»), иначе при выбранном фильтре они «схлопнутся».
        this.store.productList$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(list => {
            if (this.activeTypeFilter.code === this.typeFilters[0].code && list) {
                this.updateCounts(list);
            }
        });
    }

    public changeTypeFilter(filterItem: IProductTypeFilter): void {
        if (filterItem.code === this.activeTypeFilter.code) {
            return;
        }

        this.activeTypeFilter = filterItem;
        this.focusedChipIdx = this.typeFilters.indexOf(filterItem);
        this.typeFilters = this.typeFilters.map(item => ({ ...item, checked: item.code === filterItem.code }));
        this.store.setActiveSubFilter(filterItem.code);
        this.reload$.next();
        this.cd.markForCheck();
    }

    public onSortChange(sort: ISortOption): void {
        this.store.setSort(sort);
        this.reload$.next();
    }

    public openProduct(product: IProduct): void {
        const commands = product.promoId !== null ? ['promo', product.promoId] : ['promo', 'new'];

        this.router.navigate(commands, {
            relativeTo: this.route,
            queryParams: product.promoId === null ? { productId: product.id } : {},
        });
    }

    public onSearchFocus(): void {
        this.focusedChipIdx = -1;
        this.store.setFocusedArea(FocusedArea.SEARCH);
    }

    public onSearchKeydown(event: KeyboardEvent): void {
        // Поле поиска само обрабатывает стрелки — не даём событию уйти в таблицу.
        event.stopPropagation();

        if (event.key === 'Escape' || event.key === 'ArrowDown') {
            (event.target as HTMLInputElement).blur();
            this.store.setFocusedArea(FocusedArea.TABLE);
        }
    }

    @HostListener('document:keydown', ['$event'])
    public onKeydown(event: KeyboardEvent): void {
        if (this.store.stateSnapshot.focusedArea !== FocusedArea.FILTERS) {
            return;
        }

        const last = this.typeFilters.length - 1;

        switch (event.key) {
            case 'ArrowRight':
                this.focusedChipIdx = Math.min(this.focusedChipIdx + 1, last);
                break;
            case 'ArrowLeft':
                this.focusedChipIdx = Math.max(this.focusedChipIdx - 1, 0);
                break;
            case 'Enter':
            case ' ':
                this.changeTypeFilter(this.typeFilters[this.focusedChipIdx] ?? this.activeTypeFilter);
                break;
            case 'ArrowDown':
            case 'Escape':
                this.focusedChipIdx = -1;
                this.store.setFocusedArea(FocusedArea.TABLE);
                break;
            default:
                return;
        }

        event.preventDefault();
        this.cd.markForCheck();
    }

    public onFiltersFocus(): void {
        this.store.setFocusedArea(FocusedArea.FILTERS);
        this.focusedChipIdx = Math.max(this.typeFilters.indexOf(this.activeTypeFilter), 0);
    }

    private updateCounts(list: IProduct[]): void {
        const counts = buildProductTypeCounts(list, this.typeFilters);

        this.typeFilters = this.typeFilters.map(item => ({ ...item, count: counts.get(item.code) ?? 0 }));
        this.activeTypeFilter = this.typeFilters.find(item => item.code === this.activeTypeFilter.code) ?? this.typeFilters[0];
        this.cd.markForCheck();
    }

    private buildRequest(): IProductListRequest {
        const { sort, regionId } = this.store.stateSnapshot;

        return {
            filter: this.activeTypeFilter.request.filter,
            subfilter: this.activeTypeFilter.request.subfilter,
            searchString: this.searchControl.value.trim(),
            regionId,
            sort,
        };
    }
}
