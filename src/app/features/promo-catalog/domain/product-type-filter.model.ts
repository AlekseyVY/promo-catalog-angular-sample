import { IProduct, PromoStatus } from './catalog.models';

export enum ProductFilterEnum {
    ALL = 'ALL',
    IN_PROMO = 'IN_PROMO',
}

export enum ProductSubFilterEnum {
    ALL = 'ALL',
    ACTIVE_PROMO = 'ACTIVE_PROMO',
    ON_APPROVAL = 'ON_APPROVAL',
    ENDING_SOON = 'ENDING_SOON',
    LOW_STOCK = 'LOW_STOCK',
    SEASONAL = 'SEASONAL',
    WITHOUT_PROMO = 'WITHOUT_PROMO',
}

export const LOW_STOCK_THRESHOLD = 10;
export const ENDING_SOON_DAYS = 3;

export interface IProductTypeFilter {
    id: number;
    code: ProductSubFilterEnum;
    title: string;
    checked: boolean;
    count: number | null;
    request: {
        filter: ProductFilterEnum;
        subfilter: ProductSubFilterEnum;
    };
}

const chip = (id: number, code: ProductSubFilterEnum, title: string, filter = ProductFilterEnum.ALL): IProductTypeFilter => ({
    id,
    code,
    title,
    checked: id === 1,
    count: 0,
    request: { filter, subfilter: code },
});

export const productTypeFilters: IProductTypeFilter[] = [
    chip(1, ProductSubFilterEnum.ALL, 'Все'),
    chip(2, ProductSubFilterEnum.ACTIVE_PROMO, 'В активной акции', ProductFilterEnum.IN_PROMO),
    chip(3, ProductSubFilterEnum.ON_APPROVAL, 'На согласовании', ProductFilterEnum.IN_PROMO),
    chip(4, ProductSubFilterEnum.ENDING_SOON, 'Акция заканчивается', ProductFilterEnum.IN_PROMO),
    chip(5, ProductSubFilterEnum.LOW_STOCK, 'Мало остатков'),
    chip(6, ProductSubFilterEnum.SEASONAL, 'Сезонные'),
    chip(7, ProductSubFilterEnum.WITHOUT_PROMO, 'Без акции'),
];

/**
 * Счётчики для чипов считаются за один проход по списку,
 * чтобы не дёргать бэкенд на каждый фильтр.
 */
export function buildProductTypeCounts(
    products: IProduct[],
    filters: Pick<IProductTypeFilter, 'code'>[],
    now: Date = new Date(),
): Map<string, number> {
    const counts = new Map<string, number>();

    filters.forEach(filterItem => counts.set(filterItem.code, 0));
    counts.set(ProductSubFilterEnum.ALL, products.length);

    products.forEach(product => {
        filters.forEach(filterItem => {
            if (filterItem.code === ProductSubFilterEnum.ALL || !isProductMatchedToTypeFilter(product, filterItem.code, now)) {
                return;
            }

            counts.set(filterItem.code, (counts.get(filterItem.code) ?? 0) + 1);
        });
    });

    return counts;
}

export function filterProductsByHeaderState<T extends IProduct>(
    products: T[] | null | undefined,
    typeFilterCode: ProductSubFilterEnum | string | null | undefined,
    searchString: string | null | undefined,
): T[] {
    return filterProductsBySearch(filterProductsByType(products, typeFilterCode), searchString);
}

export function filterProductsByType<T extends IProduct>(
    products: T[] | null | undefined,
    typeFilterCode: ProductSubFilterEnum | string | null | undefined,
): T[] {
    const source = products ?? [];

    if (!typeFilterCode || typeFilterCode === ProductSubFilterEnum.ALL) {
        return source;
    }

    const now = new Date();

    return source.filter(product => isProductMatchedToTypeFilter(product, typeFilterCode, now));
}

export function filterProductsBySearch<T extends IProduct>(products: T[] | null | undefined, searchString: string | null | undefined): T[] {
    const search = normalizeText(searchString);
    const source = products ?? [];

    if (!search) {
        return source;
    }

    return source.filter(product => getProductSearchText(product).includes(search));
}

export function isProductMatchedToTypeFilter(
    product: IProduct,
    typeFilterCode: ProductSubFilterEnum | string,
    now: Date = new Date(),
): boolean {
    switch (typeFilterCode) {
        case ProductSubFilterEnum.ACTIVE_PROMO:
            return product.promoStatus === PromoStatus.ACTIVE;
        case ProductSubFilterEnum.ON_APPROVAL:
            return product.promoStatus === PromoStatus.ON_APPROVAL;
        case ProductSubFilterEnum.ENDING_SOON:
            return product.promoStatus === PromoStatus.ACTIVE && isEndingSoon(product.promoEndsAt, now);
        case ProductSubFilterEnum.LOW_STOCK:
            return product.stock < LOW_STOCK_THRESHOLD;
        case ProductSubFilterEnum.SEASONAL:
            return product.isSeasonal;
        case ProductSubFilterEnum.WITHOUT_PROMO:
            return product.promoId === null;
        default:
            return false;
    }
}

function isEndingSoon(endsAt: string | null, now: Date): boolean {
    if (!endsAt) {
        return false;
    }

    const diffMs = new Date(endsAt).getTime() - now.getTime();

    return diffMs >= 0 && diffMs <= ENDING_SOON_DAYS * 24 * 60 * 60 * 1000;
}

function getProductSearchText(product: IProduct): string {
    return normalizeText([product.sku, product.barcode, product.name, product.brand, product.categoryName, product.supplierName].join(' '));
}

export function normalizeText(value: unknown): string {
    return `${value ?? ''}`.toLocaleLowerCase('ru-RU').replace(/ё/g, 'е').trim();
}
