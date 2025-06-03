"use client"

import { Card, CardContent } from "@/components/ui/card"
import { ArrowUpRight, ArrowDownRight, TrendingUp, Wallet, CheckCircle, Clock } from "lucide-react"
import { useState, useEffect } from "react"
import { useAuth } from "@/context/auth-context"

export default function DashboardStats() {
  const [loading, setLoading] = useState(true)
  const { isDemoAccount } = useAuth()

  // Simulate loading
  useEffect(() => {
    const timer = setTimeout(() => {
      setLoading(false)
    }, 1000)

    return () => clearTimeout(timer)
  }, [])

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="border border-neutral-100 shadow-md overflow-hidden">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="h-4 bg-neutral-200 rounded w-24 mb-2"></div>
                  <div className="h-8 bg-neutral-200 rounded w-16"></div>
                </div>
                <div className="h-12 w-12 rounded-full bg-neutral-200"></div>
              </div>
              <div className="flex items-center mt-4">
                <div className="h-4 bg-neutral-200 rounded w-16"></div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  // Different stats based on account type
  const stats = isDemoAccount
    ? [
        {
          title: "Active Transactions",
          value: "12",
          icon: <TrendingUp className="h-6 w-6" />,
          iconBg: "bg-teal-50",
          iconColor: "text-teal-900",
          change: "+8.2%",
          trend: "up",
          compareText: "vs last month",
        },
        {
          title: "Total Value Locked",
          value: "$1.2M",
          icon: <Wallet className="h-6 w-6" />,
          iconBg: "bg-gold-50",
          iconColor: "text-gold-500",
          change: "+12.5%",
          trend: "up",
          compareText: "vs last month",
        },
        {
          title: "Completed Transactions",
          value: "48",
          icon: <CheckCircle className="h-6 w-6" />,
          iconBg: "bg-green-50",
          iconColor: "text-green-600",
          change: "+5.3%",
          trend: "up",
          compareText: "vs last month",
        },
        {
          title: "Average Transaction Time",
          value: "4.2 days",
          icon: <Clock className="h-6 w-6" />,
          iconBg: "bg-amber-50",
          iconColor: "text-amber-600",
          change: "-2.1%",
          trend: "down",
          compareText: "vs last month",
        },
      ]
    : [
        {
          title: "Active Transactions",
          value: "0",
          icon: <TrendingUp className="h-6 w-6" />,
          iconBg: "bg-teal-50",
          iconColor: "text-teal-900",
          change: "0%",
          trend: "neutral",
          compareText: "No previous data",
        },
        {
          title: "Total Value Locked",
          value: "$0",
          icon: <Wallet className="h-6 w-6" />,
          iconBg: "bg-gold-50",
          iconColor: "text-gold-500",
          change: "0%",
          trend: "neutral",
          compareText: "No previous data",
        },
        {
          title: "Completed Transactions",
          value: "0",
          icon: <CheckCircle className="h-6 w-6" />,
          iconBg: "bg-green-50",
          iconColor: "text-green-600",
          change: "0%",
          trend: "neutral",
          compareText: "No previous data",
        },
        {
          title: "Average Transaction Time",
          value: "0 days",
          icon: <Clock className="h-6 w-6" />,
          iconBg: "bg-amber-50",
          iconColor: "text-amber-600",
          change: "0%",
          trend: "neutral",
          compareText: "No previous data",
        },
      ]

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {stats.map((stat, index) => (
        <Card
          key={index}
          className="relative border border-neutral-100 shadow-md overflow-hidden group hover:shadow-lg transition-all"
        >
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-neutral-500 font-medium">{stat.title}</p>
                <p className="text-3xl font-bold mt-1 text-teal-900 font-display">{stat.value}</p>
              </div>
              <div
                className={`h-12 w-12 rounded-full ${stat.iconBg} flex items-center justify-center ${stat.iconColor} group-hover:bg-teal-100 transition-colors`}
              >
                {stat.icon}
              </div>
            </div>
            <div className="flex items-center mt-4 text-sm">
              {stat.trend === "up" && (
                <div className="flex items-center text-green-600">
                  <ArrowUpRight className="h-4 w-4 mr-1" />
                  <span>{stat.change}</span>
                </div>
              )}
              {stat.trend === "down" && (
                <div className="flex items-center text-red-600">
                  <ArrowDownRight className="h-4 w-4 mr-1" />
                  <span>{stat.change}</span>
                </div>
              )}
              {stat.trend === "neutral" && (
                <div className="flex items-center text-neutral-500">
                  <span>{stat.change}</span>
                </div>
              )}
              <span className="text-neutral-500 ml-2">{stat.compareText}</span>
            </div>

            {/* Decorative element */}
            <div className="absolute bottom-0 left-0 w-full h-1 bg-teal-900"></div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
