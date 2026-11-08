import type { Page, Request } from '@playwright/test'

/**
 * "Diseña tu pastel" sin backend: las opciones de la semilla (`GET cake-designs/options/`, copiadas de la API el
 * 7 de noviembre de 2026, con los mínimos por pisos y los estilos de la vista previa de D50) y un precio simulado como el del backend: los kilos por personas de la regla 3.1 y la
 * fórmula de la regla 4.6 con esas cifras, para que las pruebas lean kilos y totales reales ("Desde $1,080") sin
 * Django.
 */

export const OPTIONS_PATH = '**/api/v1/cake-designs/options/'
export const PRICE_PATH = '**/api/v1/cake-designs/price/'

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
          "preview_style": "fruit_slices",
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
          "preview_style": "fruit_slices",
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
          "preview_style": "smooth",
          "preview_color_secondary": "",
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
      "unavailable_reason": null
    },
    {
      "slug": "duya",
      "name": "Patrón con duya",
      "description": "Líneas y festones de crema",
      "pricing": "fixed",
      "price": null,
      "price_pending": true,
      "requires_quote": false,
      "available": false,
      "unavailable_reason": "Precio por confirmar"
    },
    {
      "slug": "flores",
      "name": "Flores",
      "description": "Flores hechas con duya",
      "pricing": "fixed",
      "price": null,
      "price_pending": true,
      "requires_quote": false,
      "available": false,
      "unavailable_reason": "Precio por confirmar"
    },
    {
      "slug": "chispas",
      "name": "Chispas",
      "description": "Chispas de colores",
      "pricing": "fixed",
      "price": null,
      "price_pending": true,
      "requires_quote": false,
      "available": false,
      "unavailable_reason": "Precio por confirmar"
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
      "unavailable_reason": null
    }
  ],
  "limits": {
    "people_per_kg": 7,
    "min_custom_kg": 4,
    "max_online_kg": 50,
    "wafer_price": "125.00",
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

type PriceBody = {
  people?: number
  kg?: number
  cake_type: string
  bread: string
  filling_base?: string
  filling_flavors?: string[]
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

/** Una respuesta de las opciones, o `'hang'` para dejarla sin responder. */
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
export function priceResponse(body: PriceBody): { status: number; body: object } {
  const size = body.people === undefined ? null : sizeFor(body.people)
  if (size?.above_maximum) {
    const empty = { price_per_kg: null, kg: null, cake_subtotal: null, wafer: null, decoration: null, total: null }
    return { status: 200, body: { ...empty, requires_quote: null, is_estimate: null, stand: null, size } }
  }
  const kg = size ? size.kg : (body.kg ?? 0)
  const perKg = pricePerKg(body)
  if (perKg === null || kg < cakeDesignOptions.limits.min_custom_kg || kg > cakeDesignOptions.limits.max_online_kg) {
    return { status: 400, body: { bread: ['Elección no válida.'], ...(size ? { size } : {}) } }
  }
  const total = perKg * kg
  return {
    status: 200,
    body: {
      price_per_kg: money(perKg),
      kg,
      cake_subtotal: money(total),
      wafer: '0.00',
      decoration: '0.00',
      total: money(total),
      requires_quote: false,
      is_estimate: body.estimate === true,
      stand: null,
      size,
    },
  }
}

/** Responde el precio con la fórmula de las reglas y guarda cada cuerpo recibido, en orden. */
export async function mockCakeDesignPrice(page: Page) {
  const bodies: PriceBody[] = []
  await page.route(PRICE_PATH, async (route) => {
    const body = route.request().postDataJSON() as PriceBody
    bodies.push(body)
    const response = priceResponse(body)
    await route.fulfill({ status: response.status, contentType: 'application/json', body: JSON.stringify(response.body) })
  })
  return bodies
}
