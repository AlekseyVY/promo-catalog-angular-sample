export type ProductId = number;
export type PromoId = number;

export enum PromoStatus {
    DRAFT = 'DRAFT',
    ON_APPROVAL = 'ON_APPROVAL',
    ACTIVE = 'ACTIVE',
    FINISHED = 'FINISHED',
    CANCELLED = 'CANCELLED',
}

export enum PromoMechanic {
    DISCOUNT_PERCENT = 'DISCOUNT_PERCENT',
    DISCOUNT_FIXED = 'DISCOUNT_FIXED',
    N_PLUS_ONE = 'N_PLUS_ONE',
    SPECIAL_PRICE = 'SPECIAL_PRICE',
}

export interface IProduct {
    id: ProductId;
    sku: string;
    barcode: string | null;
    name: string;
    brand: string | null;
    categoryId: number;
    categoryName: string;
    supplierName: string | null;
    regularPrice: number;
    promoPrice: number | null;
    stock: number;
    isActive: boolean;
    isSeasonal: boolean;
    /** id активной промо-акции, в которой участвует товар */
    promoId: PromoId | null;
    promoStatus: PromoStatus | null;
    promoEndsAt: string | null;
}

export interface IProductListRequest {
    filter: string;
    subfilter: string;
    searchString: string;
    regionId: number | null;
    sort: ISortOption;
}

export interface ISortOption {
    attributeName: string;
    sortOrder: 'ASC' | 'DESC';
}

export interface IPromo {
    id: PromoId | null;
    title: string;
    mechanic: PromoMechanic;
    status: PromoStatus;
    startDate: string;
    endDate: string;
    regionIds: number[];
    budget: number | null;
    discountValue: number | null;
    conditions: IPromoCondition[];
    comment: string | null;
}

export interface IPromoCondition {
    productId: ProductId;
    minQuantity: number;
    limitPerCustomer: number | null;
}

export interface IDictionaryItem {
    id: number;
    code: string;
    title: string;
    isArchived?: boolean;
}
