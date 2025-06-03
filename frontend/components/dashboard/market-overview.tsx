"use client"

import { TrendingUp, TrendingDown } from "lucide-react"
import { useDatabaseStore } from "@/lib/mock-database"
import { useState, useEffect } from "react"

interface Asset {
  id: string
  name: string
  symbol: string
  amount: number
  price: string
  value: number
  change: string
  trend: "up" | "down" | "neutral"
}

interface MarketOverviewProps {
  assets?: Asset[]
}

export default function MarketOverview({ assets: propAssets }: MarketOverviewProps) {
  const { getAssets } = useDatabaseStore()
  const [assets, setAssets] = useState<Asset[]>(propAssets || [])
  const [loading, setLoading] = useState(!propAssets)

  useEffect(() => {
    if (propAssets) {
      setAssets(propAssets)
      setLoading(false)
    } else {
      // Simulate loading
      const timer = setTimeout(() => {
        setAssets(getAssets())
        setLoading(false)
      }, 1000)

      return () => clearTimeout(timer)
    }
  }, [propAssets, getAssets])

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center justify-between p-3 animate-pulse">
            <div>
              <div className="h-5 bg-neutral-200 rounded w-24 mb-2"></div>
              <div className="h-4 bg-neutral-200 rounded w-16"></div>
            </div>
            <div className="h-6 bg-neutral-200 rounded w-16"></div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-1">
      {assets.map((asset, index) => (
        <div
          key={index}
          className="flex items-center justify-between p-3 rounded-lg hover:bg-neutral-50 transition-colors"
        >
          <div>
            <div className="flex items-center">
              <div
                className={`w-8 h-8 rounded-full mr-3 flex items-center justify-center ${
                  asset.symbol === "BTC"
                    ? "bg-amber-100 text-amber-700"
                    : asset.symbol === "ETH"
                      ? "bg-blue-100 text-blue-700"
                      : asset.symbol === "USDC"
                        ? "bg-teal-100 text-teal-700"
                        : "bg-purple-100 text-purple-700"
                }`}
              >
                {asset.symbol.charAt(0)}
              </div>
              <div>
                <p className="font-medium text-teal-900 font-display">{asset.name}</p>
                <p className="text-xs text-neutral-500">{asset.price}</p>
              </div>
            </div>
          </div>
          <div
            className={`flex items-center ${
              asset.trend === "up" ? "text-green-600" : asset.trend === "down" ? "text-red-600" : "text-neutral-500"
            }`}
          >
            {asset.trend === "up" ? (
              <TrendingUp className="h-4 w-4 mr-1" />
            ) : asset.trend === "down" ? (
              <TrendingDown className="h-4 w-4 mr-1" />
            ) : null}
            <span className="font-medium">{asset.change}</span>
          </div>
        </div>
      ))}
    </div>
  )
}
