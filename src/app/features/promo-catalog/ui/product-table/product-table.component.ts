import { CdkVirtualScrollViewport, ScrollingModule } from '@angular/cdk/scrolling';
import { AsyncPipe, CurrencyPipe, DatePipe, NgClass } from '@angular/common';
import {
    ChangeDetectionStrategy,
    ChangeDetectorRef,
    Component,
    DestroyRef,
    EventEmitter,
    HostListener,
    inject,
    Input,
    NgZone,
    OnInit,
    Output,
    ViewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { combineLatest, distinctUntilChanged, filter, map, Observable, shareReplay, tap } from 'rxjs';

import { CatalogStore, FocusedArea } from '../../data-access/catalog.store';
import { IProduct, ISortOption, PromoStatus } from '../../domain/catalog.models';
import { filterProductsByHeaderState, LOW_STOCK_THRESHOLD } from '../../domain/product-type-filter.model';

export interface IProductRowViewModel {
    product: IProduct;
    discountPercent: number | null;
    isLowStock: boolean;
    isInactive: boolean;
    statusTitle: string;
    statusClass: string;
    showNameTooltip: boolean;
}

interface IProductListState {
    list: IProduct[];
    rows: IProductRowViewModel[];
    indexById: Map<number, number>;
}

export const PRODUCT_ROW_HEIGHT_PX = 40;
const NAME_TOOLTIP_MAX_LEN = 48;

const STATUS_VIEW: Record<PromoStatus, { title: string; cssClass: string }> = {
    [PromoStatus.DRAFT]: { title: 'Черновик', cssClass: 'status--draft' },
    [PromoStatus.ON_APPROVAL]: { title: 'На согласовании', cssClass: 'status--approval' },
    [PromoStatus.ACTIVE]: { title: 'Активна', cssClass: 'status--active' },
    [PromoStatus.FINISHED]: { title: 'Завершена', cssClass: 'status--finished' },
    [PromoStatus.CANCELLED]: { title: 'Отменена', cssClass: 'status--cancelled' },
};

/**
 * Таблица товаров на десятки тысяч строк.
 *
 * - CDK virtual scroll: в DOM только видимые строки.
 * - OnPush + заранее посчитанные view-model строк: в шаблоне нет вызовов методов и пайпов-расчётов.
 * - Map id -> индекс: поиск выделенной строки за O(1) вместо findIndex на каждое изменение.
 * - Клавиатурная навигация (стрелки, Home/End, PageUp/PageDown, Enter) для операторов,
 *   которые работают без мыши.
 */
@Component({
    selector: 'app-product-table',
    standalone: true,
    templateUrl: './product-table.component.html',
    styleUrls: ['./product-table.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [ScrollingModule, AsyncPipe, NgClass, CurrencyPipe, DatePipe],
})
export class ProductTableComponent implements OnInit {
    @Input({ required: true }) public searchString$!: Observable<string>;

    @Output() public readonly openProduct = new EventEmitter<IProduct>();
    @Output() public readonly sortChange = new EventEmitter<ISortOption>();

    @ViewChild(CdkVirtualScrollViewport) private viewport?: CdkVirtualScrollViewport;

    public readonly rowHeight = PRODUCT_ROW_HEIGHT_PX;
    public readonly store = inject(CatalogStore);
    public readonly loading$ = this.store.productListLoading$;
    public readonly sort$ = this.store.sort$;

    public rows: IProductRowViewModel[] = [];
    public selectedRowIdx = -1;

    private indexById = new Map<number, number>();

    private readonly cd = inject(ChangeDetectorRef);
    private readonly zone = inject(NgZone);
    private readonly destroyRef = inject(DestroyRef);

    private readonly handledKeys = new Set<string>(['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', 'Enter']);

    public ngOnInit(): void {
        const listState$: Observable<IProductListState> = combineLatest([
            this.store.productList$.pipe(filter((list): list is IProduct[] => Array.isArray(list))),
            this.store.activeSubFilter$,
            this.searchString$.pipe(distinctUntilChanged()),
        ]).pipe(
            map(([list, subFilter, search]) => filterProductsByHeaderState(list, subFilter, search)),
            map(list => ({
                list,
                rows: list.map(product => this.toRowViewModel(product)),
                indexById: this.buildIndexMap(list),
            })),
            shareReplay({ bufferSize: 1, refCount: true }),
        );

        listState$
            .pipe(
                tap(({ rows, indexById }) => {
                    this.rows = rows;
                    this.indexById = indexById;

                    const selectedId = this.store.stateSnapshot.selectedProduct?.id;

                    // Выделенный товар пропал из выборки после фильтрации — сбрасываем выделение.
                    if (selectedId !== undefined && !indexById.has(selectedId)) {
                        this.store.setSelectedProduct(null);
                    }

                    this.cd.markForCheck();
                    this.scheduleUiSync(() => this.viewport?.checkViewportSize());
                }),
                takeUntilDestroyed(this.destroyRef),
            )
            .subscribe();

        combineLatest([this.store.selectedProduct$, listState$])
            .pipe(
                map(([product, { indexById }]) => (product ? indexById.get(product.id) ?? -1 : -1)),
                distinctUntilChanged(),
                takeUntilDestroyed(this.destroyRef),
            )
            .subscribe(idx => {
                this.selectedRowIdx = idx;
                this.cd.markForCheck();
            });
    }

    @HostListener('document:keydown', ['$event'])
    public onKeydown(event: KeyboardEvent): void {
        if (!this.handledKeys.has(event.key) || this.store.stateSnapshot.focusedArea !== FocusedArea.TABLE || !this.rows.length) {
            return;
        }

        event.preventDefault();

        const pageSize = this.getPageSize();
        const last = this.rows.length - 1;
        const current = this.selectedRowIdx;

        switch (event.key) {
            case 'ArrowDown':
                this.selectRow(Math.min(current + 1, last));
                break;
            case 'ArrowUp':
                this.selectRow(Math.max(current - 1, 0));
                break;
            case 'PageDown':
                this.selectRow(Math.min(current + pageSize, last));
                break;
            case 'PageUp':
                this.selectRow(Math.max(current - pageSize, 0));
                break;
            case 'Home':
                this.selectRow(0);
                break;
            case 'End':
                this.selectRow(last);
                break;
            case 'Enter': {
                const row = this.rows[current];
                if (row) {
                    this.openProduct.emit(row.product);
                }
                break;
            }
        }
    }

    public selectFromClick(idx: number): void {
        this.store.setFocusedArea(FocusedArea.TABLE);
        this.selectRow(idx, false);
    }

    public onHeaderClick(attributeName: string, current: ISortOption): void {
        const sortOrder = current.attributeName === attributeName && current.sortOrder === 'ASC' ? 'DESC' : 'ASC';
        this.sortChange.emit({ attributeName, sortOrder });
    }

    public readonly trackByProductRow = (_index: number, row: IProductRowViewModel): number => row.product.id;

    private selectRow(idx: number, scroll = true): void {
        const row = this.rows[idx];

        if (!row) {
            return;
        }

        this.selectedRowIdx = idx;
        this.store.setSelectedProduct(row.product);

        if (scroll) {
            this.scrollIntoView(idx);
        }

        this.cd.markForCheck();
    }

    /** Скроллим только если строка вышла за видимую область, иначе таблица «прыгает». */
    private scrollIntoView(idx: number): void {
        const viewport = this.viewport;

        if (!viewport) {
            return;
        }

        const { start, end } = viewport.getRenderedRange();
        const visibleRows = this.getPageSize();
        const firstVisible = Math.floor(viewport.measureScrollOffset() / this.rowHeight);

        if (idx < firstVisible) {
            viewport.scrollToIndex(idx);
        } else if (idx >= firstVisible + visibleRows || idx >= end || idx < start) {
            viewport.scrollToIndex(Math.max(idx - visibleRows + 1, 0));
        }
    }

    private getPageSize(): number {
        const height = this.viewport?.getViewportSize() ?? 0;

        return Math.max(Math.floor(height / this.rowHeight), 1);
    }

    /** UI-синхронизация после отрисовки кадра, вне зоны — не запускает лишний change detection. */
    private scheduleUiSync(fn: () => void): void {
        this.zone.runOutsideAngular(() => requestAnimationFrame(fn));
    }

    private buildIndexMap(list: IProduct[]): Map<number, number> {
        const indexById = new Map<number, number>();
        list.forEach((product, idx) => indexById.set(product.id, idx));

        return indexById;
    }

    private toRowViewModel(product: IProduct): IProductRowViewModel {
        const status = product.promoStatus ? STATUS_VIEW[product.promoStatus] : null;
        const discountPercent =
            product.promoPrice !== null && product.regularPrice > 0
                ? Math.round((1 - product.promoPrice / product.regularPrice) * 100)
                : null;

        return {
            product,
            discountPercent,
            isLowStock: product.stock < LOW_STOCK_THRESHOLD,
            isInactive: !product.isActive,
            statusTitle: status?.title ?? '—',
            statusClass: status?.cssClass ?? '',
            showNameTooltip: product.name.length > NAME_TOOLTIP_MAX_LEN,
        };
    }
}
