import type { Page, Request } from '@playwright/test'

/**
 * "Diseña tu pastel" sin backend: las opciones de la semilla (`GET cake-designs/options/`, copiadas de la API el
 * 7 de noviembre de 2026, con los mínimos por pisos y los estilos de la vista previa de D50; durazno y fresa con
 * el estilo `fruit_chunks` de D51; desde D52, los moldes, los estilos nuevos de la fresa con yogurt y la nuez y el
 * relleno incluido de Choco-pingüino y Red velvet, como los siembran las migraciones `0019` y `0021`; desde D53, las
 * ocho decoraciones del paso 6 como las dejan la `0023` y la `0024` ("Rosas"), con los precios PENDIENTE) y un precio simulado como el del backend: los kilos por personas de la regla 3.1 y la
 * fórmula de la regla 4.6 con esas cifras, para que las pruebas lean kilos y totales reales ("Desde $1,080") sin
 * Django.
 */

export const OPTIONS_PATH = '**/api/v1/cake-designs/options/'
export const PRICE_PATH = '**/api/v1/cake-designs/price/'

/** Una decoración de las opciones, con el precio y la disponibilidad que le da el admin (D39). */
type DecorationFixture = {
  slug: string
  name: string
  description: string
  pricing: string
  price: string | null
  price_pending: boolean
  requires_quote: boolean
  available: boolean
  unavailable_reason: string | null
  /** Solo las chispas: el sabor o el pan de donde salen su estilo y sus colores. */
  preview_flavor?: string | null
  preview_bread?: string | null
}

export const cakeDesignOptions = {
  "cake_types": [
    {
      "value": "tres_leches",
      "label": "Tres leches"
    },
    {
      "value": "seco",
      "label": "Seco"
    },
    {
      "value": "envinado",
      "label": "Envinado"
    }
  ],
  "breads": [
    {
      "slug": "vainilla",
      "name": "Vainilla",
      "description": "",
      "pricing_mode": "extra_per_kg",
      "price_per_kg": "0.00",
      "included_filling": "",
      "preview_color": "#F0CE8A",
      "preview_color_bottom": "",
      "included_filling_preview_style": "smooth",
      "included_filling_preview_color_secondary": "",
      "allowed_cake_types": [
        "tres_leches",
        "seco",
        "envinado"
      ],
      "unavailable_reasons": {},
      "unavailable_codes": {},
      "price_per_kg_from": {
        "tres_leches": "180.00",
        "seco": "180.00",
        "envinado": "200.00"
      }
    },
    {
      "slug": "chocolate",
      "name": "Chocolate",
      "description": "",
      "pricing_mode": "extra_per_kg",
      "price_per_kg": "5.00",
      "included_filling": "",
      "preview_color": "#805438",
      "preview_color_bottom": "",
      "included_filling_preview_style": "smooth",
      "included_filling_preview_color_secondary": "",
      "allowed_cake_types": [
        "tres_leches",
        "seco",
        "envinado"
      ],
      "unavailable_reasons": {},
      "unavailable_codes": {},
      "price_per_kg_from": {
        "tres_leches": "185.00",
        "seco": "185.00",
        "envinado": "205.00"
      }
    },
    {
      "slug": "choco_vainilla",
      "name": "Choco-vainilla",
      "description": "",
      "pricing_mode": "extra_per_kg",
      "price_per_kg": "5.00",
      "included_filling": "",
      "preview_color": "#805438",
      "preview_color_bottom": "#F0CE8A",
      "included_filling_preview_style": "smooth",
      "included_filling_preview_color_secondary": "",
      "allowed_cake_types": [
        "tres_leches",
        "seco",
        "envinado"
      ],
      "unavailable_reasons": {},
      "unavailable_codes": {},
      "price_per_kg_from": {
        "tres_leches": "185.00",
        "seco": "185.00",
        "envinado": "205.00"
      }
    },
    {
      "slug": "choco_pinguino",
      "name": "Choco-pingüino",
      "description": "",
      "pricing_mode": "full_price_per_kg",
      "price_per_kg": "250.00",
      "included_filling": "Crema de chocolate sabor helado",
      "preview_color": "#603C2A",
      "preview_color_bottom": "",
      "included_filling_preview_style": "round_chips",
      "included_filling_preview_color_secondary": "#3A2218",
      "allowed_cake_types": [
        "tres_leches",
        "seco"
      ],
      "unavailable_reasons": {
        "envinado": "No se combina con pastel envinado"
      },
      "unavailable_codes": {
        "envinado": "not_combinable"
      },
      "price_per_kg_from": {
        "tres_leches": "250.00",
        "seco": "250.00"
      }
    },
    {
      "slug": "red_velvet",
      "name": "Red velvet",
      "description": "",
      "pricing_mode": "full_price_per_kg",
      "price_per_kg": "280.00",
      "included_filling": "Relleno típico de red velvet",
      "preview_color": "#B8363A",
      "preview_color_bottom": "",
      "included_filling_preview_style": "sprinkles",
      "included_filling_preview_color_secondary": "#C8283A",
      "allowed_cake_types": [
        "seco"
      ],
      "unavailable_reasons": {
        "tres_leches": "Solo en pastel seco",
        "envinado": "Solo en pastel seco"
      },
      "unavailable_codes": {
        "tres_leches": "only_in",
        "envinado": "only_in"
      },
      "price_per_kg_from": {
        "seco": "280.00"
      }
    }
  ],
  "filling_bases": [
    {
      "slug": "normal",
      "name": "Normal",
      "description": "",
      "preview_color": "",
      "max_flavors": 2,
      "combined_extra_per_kg": "5.00",
      "allowed_cake_types": [
        "tres_leches",
        "seco",
        "envinado"
      ],
      "unavailable_reasons": {},
      "unavailable_codes": {},
      "price_per_kg_by_cake_type": {
        "tres_leches": "180.00",
        "seco": "180.00",
        "envinado": "200.00"
      },
      "flavors": [
        {
          "slug": "durazno",
          "name": "Durazno",
          "preview_color": "#F6B054",
          "preview_style": "fruit_chunks",
          "preview_color_secondary": "#FBD08F",
          "is_combinable": true,
          "allowed_cake_types": [
            "tres_leches",
            "seco",
            "envinado"
          ],
          "unavailable_reasons": {},
          "unavailable_codes": {},
          "price_per_kg_by_cake_type": {}
        },
        {
          "slug": "fresa",
          "name": "Fresa",
          "preview_color": "#E25468",
          "preview_style": "fruit_chunks",
          "preview_color_secondary": "#C8283A",
          "is_combinable": true,
          "allowed_cake_types": [
            "tres_leches",
            "seco",
            "envinado"
          ],
          "unavailable_reasons": {},
          "unavailable_codes": {},
          "price_per_kg_by_cake_type": {}
        },
        {
          "slug": "zarzamora",
          "name": "Zarzamora",
          "preview_color": "#702C5A",
          "preview_style": "smooth",
          "preview_color_secondary": "",
          "is_combinable": true,
          "allowed_cake_types": [
            "tres_leches",
            "seco",
            "envinado"
          ],
          "unavailable_reasons": {},
          "unavailable_codes": {},
          "price_per_kg_by_cake_type": {}
        },
        {
          "slug": "cajeta",
          "name": "Cajeta",
          "preview_color": "#BC7630",
          "preview_style": "smooth",
          "preview_color_secondary": "",
          "is_combinable": true,
          "allowed_cake_types": [
            "tres_leches",
            "seco",
            "envinado"
          ],
          "unavailable_reasons": {},
          "unavailable_codes": {},
          "price_per_kg_by_cake_type": {}
        },
        {
          "slug": "galleta",
          "name": "Galleta",
          "preview_color": "#CEA876",
          "preview_style": "cookie_chunks",
          "preview_color_secondary": "#2B1D1A",
          "is_combinable": true,
          "allowed_cake_types": [
            "tres_leches",
            "seco",
            "envinado"
          ],
          "unavailable_reasons": {},
          "unavailable_codes": {},
          "price_per_kg_by_cake_type": {}
        },
        {
          "slug": "chocolate",
          "name": "Chocolate",
          "preview_color": "#5C3826",
          "preview_style": "sprinkles",
          "preview_color_secondary": "#3A2218",
          "is_combinable": true,
          "allowed_cake_types": [
            "tres_leches",
            "seco",
            "envinado"
          ],
          "unavailable_reasons": {},
          "unavailable_codes": {},
          "price_per_kg_by_cake_type": {}
        },
        {
          "slug": "choco_vainilla",
          "name": "Choco vainilla",
          "preview_color": "#966846",
          "preview_style": "sprinkles",
          "preview_color_secondary": "#FFFBFB",
          "is_combinable": true,
          "allowed_cake_types": [
            "tres_leches",
            "seco",
            "envinado"
          ],
          "unavailable_reasons": {},
          "unavailable_codes": {},
          "price_per_kg_by_cake_type": {}
        },
        {
          "slug": "capuchino",
          "name": "Capuchino",
          "preview_color": "#AA7A56",
          "preview_style": "sprinkles",
          "preview_color_secondary": "#5A3A28",
          "is_combinable": true,
          "allowed_cake_types": [
            "tres_leches",
            "seco",
            "envinado"
          ],
          "unavailable_reasons": {},
          "unavailable_codes": {},
          "price_per_kg_by_cake_type": {}
        },
        {
          "slug": "fresa_yogurt",
          "name": "Fresa con yogurt",
          "preview_color": "#F0A4B2",
          "preview_style": "crumbles",
          "preview_color_secondary": "#D95F76",
          "is_combinable": false,
          "allowed_cake_types": [
            "tres_leches",
            "seco"
          ],
          "unavailable_reasons": {
            "envinado": "No disponible en pastel envinado"
          },
          "unavailable_codes": {
            "envinado": "not_offered"
          },
          "price_per_kg_by_cake_type": {
            "tres_leches": "190.00",
            "seco": "190.00"
          }
        },
        {
          "slug": "nuez",
          "name": "Nuez",
          "preview_color": "#B08A60",
          "preview_style": "nut_pieces",
          "preview_color_secondary": "#7A5230",
          "is_combinable": true,
          "allowed_cake_types": [
            "tres_leches",
            "seco",
            "envinado"
          ],
          "unavailable_reasons": {},
          "unavailable_codes": {},
          "price_per_kg_by_cake_type": {
            "tres_leches": "190.00",
            "seco": "190.00",
            "envinado": "200.00"
          }
        }
      ]
    },
    {
      "slug": "queso",
      "name": "Con queso",
      "description": "",
      "preview_color": "#FAF4E2",
      "max_flavors": 1,
      "combined_extra_per_kg": "0.00",
      "allowed_cake_types": [
        "tres_leches",
        "seco",
        "envinado"
      ],
      "unavailable_reasons": {},
      "unavailable_codes": {},
      "price_per_kg_by_cake_type": {
        "tres_leches": "250.00",
        "seco": "250.00",
        "envinado": "250.00"
      },
      "flavors": [
        {
          "slug": "zarzamora",
          "name": "Zarzamora",
          "preview_color": "#702C5A",
          "preview_style": "smooth",
          "preview_color_secondary": "",
          "is_combinable": true,
          "allowed_cake_types": [
            "tres_leches",
            "seco",
            "envinado"
          ],
          "unavailable_reasons": {},
          "unavailable_codes": {},
          "price_per_kg_by_cake_type": {}
        },
        {
          "slug": "chocolate",
          "name": "Chocolate",
          "preview_color": "#5C3826",
          "preview_style": "sprinkles",
          "preview_color_secondary": "#3A2218",
          "is_combinable": true,
          "allowed_cake_types": [
            "tres_leches",
            "seco",
            "envinado"
          ],
          "unavailable_reasons": {},
          "unavailable_codes": {},
          "price_per_kg_by_cake_type": {}
        }
      ]
    },
    {
      "slug": "flan",
      "name": "Con flan",
      "description": "",
      "preview_color": "#F2C860",
      "max_flavors": 1,
      "combined_extra_per_kg": "0.00",
      "allowed_cake_types": [
        "tres_leches",
        "seco",
        "envinado"
      ],
      "unavailable_reasons": {},
      "unavailable_codes": {},
      "price_per_kg_by_cake_type": {
        "tres_leches": "250.00",
        "seco": "250.00",
        "envinado": "250.00"
      },
      "flavors": [
        {
          "slug": "zarzamora",
          "name": "Zarzamora",
          "preview_color": "#702C5A",
          "preview_style": "smooth",
          "preview_color_secondary": "",
          "is_combinable": true,
          "allowed_cake_types": [
            "tres_leches",
            "seco",
            "envinado"
          ],
          "unavailable_reasons": {},
          "unavailable_codes": {},
          "price_per_kg_by_cake_type": {}
        },
        {
          "slug": "cajeta",
          "name": "Cajeta",
          "preview_color": "#BC7630",
          "preview_style": "smooth",
          "preview_color_secondary": "",
          "is_combinable": true,
          "allowed_cake_types": [
            "tres_leches",
            "seco",
            "envinado"
          ],
          "unavailable_reasons": {},
          "unavailable_codes": {},
          "price_per_kg_by_cake_type": {}
        }
      ]
    }
  ],
  "coverage_colors": [
    {
      "slug": "amarillo",
      "name": "Amarillo",
      "preview_color": "#FAE496"
    },
    {
      "slug": "blanco",
      "name": "Blanco",
      "preview_color": "#FFFBFB"
    },
    {
      "slug": "azulfuerte",
      "name": "Azul fuerte",
      "preview_color": "#4A70BA"
    },
    {
      "slug": "azulclaro",
      "name": "Azul claro",
      "preview_color": "#B0D0EC"
    },
    {
      "slug": "verde",
      "name": "Verde",
      "preview_color": "#A6CE98"
    },
    {
      "slug": "naranja",
      "name": "Naranja",
      "preview_color": "#F6B06C"
    },
    {
      "slug": "cafe",
      "name": "Café",
      "preview_color": "#9C6E50"
    },
    {
      "slug": "turquesa",
      "name": "Turquesa",
      "preview_color": "#6ECAC6"
    },
    {
      "slug": "rojo",
      "name": "Rojo",
      "preview_color": "#D44C48"
    },
    {
      "slug": "rosa",
      "name": "Rosa",
      "preview_color": "#F6B8CA"
    },
    {
      "slug": "lila",
      "name": "Lila",
      "preview_color": "#CCBAE4"
    }
  ],
  "decorations": [
    {
      "slug": "ninguna",
      "name": "Sin decoración",
      "description": "Solo la cobertura",
      "pricing": "included",
      "price": null,
      "price_pending": false,
      "requires_quote": false,
      "available": true,
      "unavailable_reason": null,
      "preview_flavor": null,
      "preview_bread": null
    },
    {
      "slug": "duya",
      "name": "Borde de conchas",
      "description": "Conchas de duya estrella arriba y abajo de cada piso",
      "pricing": "included",
      "price": null,
      "price_pending": false,
      "requires_quote": false,
      "available": true,
      "unavailable_reason": null,
      "preview_flavor": null,
      "preview_bread": null
    },
    {
      "slug": "rosetones",
      "name": "Rosetones",
      "description": "Rosetas en espiral alrededor del borde de arriba",
      "pricing": "included",
      "price": null,
      "price_pending": false,
      "requires_quote": false,
      "available": true,
      "unavailable_reason": null,
      "preview_flavor": null,
      "preview_bread": null
    },
    {
      "slug": "festones",
      "name": "Festones colgantes",
      "description": "Guirnaldas de crema que cuelgan del borde, con perlitas",
      "pricing": "included",
      "price": null,
      "price_pending": false,
      "requires_quote": false,
      "available": true,
      "unavailable_reason": null,
      "preview_flavor": null,
      "preview_bread": null
    },
    {
      "slug": "olanes",
      "name": "Olanes",
      "description": "Ondas de crema por el costado, con duya de pétalo",
      "pricing": "included",
      "price": null,
      "price_pending": false,
      "requires_quote": false,
      "available": true,
      "unavailable_reason": null,
      "preview_flavor": null,
      "preview_bread": null
    },
    {
      "slug": "flores",
      "name": "Rosas",
      "description": "Rosas de crema hechas con duya",
      "pricing": "fixed",
      "price": "120.00",
      "price_pending": false,
      "requires_quote": false,
      "available": true,
      "unavailable_reason": null,
      "preview_flavor": null,
      "preview_bread": null
    },
    {
      "slug": "chispas",
      "name": "Chispas de capuchino",
      "description": "Granillo café, como el relleno de capuchino",
      "pricing": "included",
      "price": null,
      "price_pending": false,
      "requires_quote": false,
      "available": true,
      "unavailable_reason": null,
      "preview_flavor": "capuchino",
      "preview_bread": null
    },
    {
      "slug": "chispas-chocolate",
      "name": "Chispas de chocolate",
      "description": "Chispas redondas de chocolate, como el relleno de Choco-pingüino",
      "pricing": "included",
      "price": null,
      "price_pending": false,
      "requires_quote": false,
      "available": true,
      "unavailable_reason": null,
      "preview_flavor": null,
      "preview_bread": "choco_pinguino"
    },
    {
      "slug": "chispas-choco-vainilla",
      "name": "Chispas choco-vainilla",
      "description": "Granillo blanco y de chocolate, como el relleno de choco vainilla",
      "pricing": "included",
      "price": null,
      "price_pending": false,
      "requires_quote": false,
      "available": true,
      "unavailable_reason": null,
      "preview_flavor": "choco_vainilla",
      "preview_bread": null
    },
    {
      "slug": "otra",
      "name": "Otra decoración",
      "description": "Sube una imagen y la pastelería te dice el precio",
      "pricing": "quote",
      "price": null,
      "price_pending": false,
      "requires_quote": true,
      "available": true,
      "unavailable_reason": null,
      "preview_flavor": null,
      "preview_bread": null
    }
  ] as DecorationFixture[],
  "limits": {
    "people_per_kg": 7,
    "min_custom_kg": 4,
    "max_online_kg": 50,
    "wafer_price": "125.00" as string | null,
    "wafer_max_width_cm": "21.6",
    "wafer_max_height_cm": "27.9",
    "message_suggested_max_words": 4
  },
  "tier_minimums": [
    {
      "tiers": 1,
      "min_kg": 0
    },
    {
      "tiers": 2,
      "min_kg": 15
    },
    {
      "tiers": 3,
      "min_kg": 18
    },
    {
      "tiers": 4,
      "min_kg": 25
    },
    {
      "tiers": 5,
      "min_kg": 30
    }
  ],
  "cake_molds": [
    {
      "form": "round",
      "kg": "2.7",
      "length_cm": "28.0",
      "width_cm": null
    },
    {
      "form": "round",
      "kg": "4.0",
      "length_cm": "34.0",
      "width_cm": null
    },
    {
      "form": "round",
      "kg": "6.0",
      "length_cm": "37.0",
      "width_cm": null
    },
    {
      "form": "round",
      "kg": "8.0",
      "length_cm": "41.0",
      "width_cm": null
    },
    {
      "form": "round",
      "kg": "10.0",
      "length_cm": "47.0",
      "width_cm": null
    },
    {
      "form": "round",
      "kg": "12.0",
      "length_cm": "51.5",
      "width_cm": null
    },
    {
      "form": "rectangular",
      "kg": "4.0",
      "length_cm": "41.0",
      "width_cm": "26.0"
    },
    {
      "form": "rectangular",
      "kg": "5.0",
      "length_cm": "42.0",
      "width_cm": "28.0"
    },
    {
      "form": "rectangular",
      "kg": "6.0",
      "length_cm": "45.4",
      "width_cm": "29.5"
    },
    {
      "form": "rectangular",
      "kg": "7.0",
      "length_cm": "48.0",
      "width_cm": "33.0"
    },
    {
      "form": "rectangular",
      "kg": "8.0",
      "length_cm": "50.0",
      "width_cm": "33.0"
    },
    {
      "form": "rectangular",
      "kg": "9.0",
      "length_cm": "53.5",
      "width_cm": "41.0"
    },
    {
      "form": "rectangular",
      "kg": "10.0",
      "length_cm": "60.0",
      "width_cm": "44.0"
    }
  ],
  "smaller_alternatives": {
    "showcase_cake": {
      "approx_weight_kg": "2.7",
      "servings": 19
    },
    "mini_cake": {
      "approx_weight_kg": null,
      "servings": 3
    }
  }
}

/** Las decoraciones dadas sin precio definido (PENDIENTE): cobro fijo, sin precio y no disponibles (D39). */
export function withPendingDecorations(slugs: string[]) {
  return {
    ...cakeDesignOptions,
    decorations: cakeDesignOptions.decorations.map((decoration) =>
      slugs.includes(decoration.slug)
        ? { ...decoration, pricing: 'fixed', price: null, price_pending: true, available: false, unavailable_reason: 'Precio por confirmar' }
        : decoration,
    ),
  }
}

type PriceBody = {
  wafer?: boolean
  people?: number
  kg?: number
  cake_type: string
  bread: string
  filling_base?: string
  filling_flavors?: string[]
  decoration?: string
  estimate?: boolean
}

/** Precio por kilo con las cifras de las opciones (regla 4.6); `null` si la elección no vale. */
function pricePerKg(body: PriceBody): number | null {
  const bread = cakeDesignOptions.breads.find((option) => option.slug === body.bread)
  if (!bread || !bread.allowed_cake_types.includes(body.cake_type)) return null
  if (bread.pricing_mode === 'full_price_per_kg') return Number(bread.price_per_kg)
  const base = cakeDesignOptions.filling_bases.find((option) => option.slug === body.filling_base)
  const general = base?.price_per_kg_by_cake_type[body.cake_type as keyof typeof base.price_per_kg_by_cake_type]
  if (!base || !general) return null
  const flavors = body.filling_flavors ?? []
  if (flavors.length === 0 && !body.estimate) return null
  const own = flavors
    .map((slug) => base.flavors.find((flavor) => flavor.slug === slug)?.price_per_kg_by_cake_type)
    .map((prices) => (prices ? (prices as Record<string, string>)[body.cake_type] : undefined))
    .filter((price): price is string => price !== undefined)
    .map(Number)
  const filling = Math.max(Number(general), ...own) + (flavors.length > 1 ? Number(base.combined_extra_per_kg) : 0)
  return filling + Number(bread.price_per_kg)
}

const money = (value: number) => value.toFixed(2)

/** Las bases que siembran las migraciones (regla 7): kilos y depósito; la pastelería usa la siguiente más grande. */
const STANDS = [
  [4, 5, 70], [6, 8, 90], [10, 12, 150], [15, 15, 200], [20, 25, 250],
  [26, 30, 300], [31, 35, 350], [36, 40, 400], [41, 45, 450], [46, 50, 500],
] as const

function standFor(kg: number) {
  const row = STANDS.find(([, max]) => max >= kg)
  return row ? { min_kg: row[0], max_kg: row[1], deposit: money(row[2]), return_days: 15 } : null
}

/** El anticipo de la regla 10 (50% del pedido, de .5 hacia arriba al centavo) con la base aparte; sin pago si lo cotiza la pastelería. */
function paymentFor(total: number, deposit: number) {
  const advance = Math.round(total * 50) / 100
  return { advance_percent: 50, advance: money(advance), base_deposit: money(deposit), delivery_fee: '0.00', pay_today: money(advance + deposit), pay_on_delivery: money(total - advance) }
}

/** Una respuesta de las opciones, o `'hang'` para dejarla sin responder. */
/** Las opciones con la oblea sin precio definido (PENDIENTE, D39). */
export function withPendingWafer() {
  return { ...cakeDesignOptions, limits: { ...cakeDesignOptions.limits, wafer_price: null as string | null } }
}

export type OptionsResponse = { status: number; body: unknown } | 'hang'

/** Responde las opciones (por omisión, las de la semilla) y devuelve las peticiones recibidas. */
export async function mockCakeDesignOptions(page: Page, response: OptionsResponse = { status: 200, body: cakeDesignOptions }) {
  const requests: Request[] = []
  await page.route(OPTIONS_PATH, async (route) => {
    requests.push(route.request())
    if (response === 'hang') return
    await route.fulfill({ status: response.status, contentType: 'application/json', body: JSON.stringify(response.body) })
  })
  return requests
}

/** El bloque `size` del backend (regla 3.1, como `pricing_service.size_for_people`) con los límites de la semilla. */
export function sizeFor(people: number) {
  const { people_per_kg, min_custom_kg, max_online_kg } = cakeDesignOptions.limits
  const rounded = Math.floor((2 * people + people_per_kg) / (2 * people_per_kg))
  const kg = Math.max(rounded, min_custom_kg)
  return {
    people,
    rounded_kg: rounded,
    kg,
    below_minimum: rounded < min_custom_kg,
    above_maximum: kg > max_online_kg,
    minimum_people: min_custom_kg * people_per_kg,
    max_online_people: max_online_kg * people_per_kg,
    // Regla 3.3 (D50): el mayor número de pisos cuyo mínimo alcanzan los kilos.
    max_tiers: Math.max(1, ...cakeDesignOptions.tier_minimums.filter((tier) => kg >= tier.min_kg).map((tier) => tier.tiers)),
  }
}

/**
 * La respuesta del precio para un cuerpo, como la daría el backend. Una elección que no vale es un 400; con
 * `people`, trae también `size`.
 */
export function priceResponse(body: PriceBody, options: typeof cakeDesignOptions = cakeDesignOptions): { status: number; body: object } {
  const size = body.people === undefined ? null : sizeFor(body.people)
  if (size?.above_maximum) {
    const empty = { price_per_kg: null, kg: null, cake_subtotal: null, wafer: null, decoration: null, total: null }
    return { status: 200, body: { ...empty, requires_quote: null, is_estimate: null, stand: null, payment: null, size } }
  }
  const kg = size ? size.kg : (body.kg ?? 0)
  const perKg = pricePerKg(body)
  if (perKg === null || kg < cakeDesignOptions.limits.min_custom_kg || kg > cakeDesignOptions.limits.max_online_kg) {
    return { status: 400, body: { bread: ['Elección no válida.'], ...(size ? { size } : {}) } }
  }
  // La decoración, como el backend: una de precio fijo sin precio se rechaza; "Otra decoración" no suma y pide cotización.
  const decoration = body.decoration === undefined ? null : options.decorations.find((option) => option.slug === body.decoration)
  if (body.decoration !== undefined && !decoration) return { status: 400, body: { decoration: ['Esa decoración no existe o no está disponible.'], ...(size ? { size } : {}) } }
  if (decoration?.pricing === 'fixed' && decoration.price === null) return { status: 400, body: { decoration: ['Precio por confirmar'], ...(size ? { size } : {}) } }
  const decorationAmount = decoration?.pricing === 'fixed' ? Number(decoration.price) : 0
  const waferPrice = options.limits.wafer_price
  if (body.wafer && waferPrice === null) return { status: 400, body: { wafer: ['Precio por confirmar'], ...(size ? { size } : {}) } }
  const waferAmount = body.wafer ? Number(waferPrice) : 0
  const cake = perKg * kg
  const total = cake + waferAmount + decorationAmount
  const stand = standFor(kg)
  const requiresQuote = decoration?.requires_quote ?? false
  return {
    status: 200,
    body: {
      price_per_kg: money(perKg),
      kg,
      cake_subtotal: money(cake),
      wafer: money(waferAmount),
      decoration: money(decorationAmount),
      total: money(total),
      requires_quote: requiresQuote,
      is_estimate: body.estimate === true,
      stand,
      payment: requiresQuote || !stand ? null : paymentFor(total, Number(stand.deposit)),
      size,
    },
  }
}

/** Responde el precio con la fórmula de las reglas y guarda cada cuerpo recibido, en orden. */
export async function mockCakeDesignPrice(page: Page, options: typeof cakeDesignOptions = cakeDesignOptions) {
  const bodies: PriceBody[] = []
  await page.route(PRICE_PATH, async (route) => {
    const body = route.request().postDataJSON() as PriceBody
    bodies.push(body)
    const response = priceResponse(body, options)
    await route.fulfill({ status: response.status, contentType: 'application/json', body: JSON.stringify(response.body) })
  })
  return bodies
}
