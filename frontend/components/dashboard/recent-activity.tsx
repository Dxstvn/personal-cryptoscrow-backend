"use client"

import { ArrowUpRight, ArrowDownRight, FileText, MessageSquare } from "lucide-react"
import { useDatabaseStore } from "@/lib/mock-database"
import { useState, useEffect } from "react"

interface Activity {
  id: number
  type: string
  title: string
  description: string
  time: string
  date: string
  iconBg?: string
  iconColor?: string
}

interface RecentActivityProps {
  activities?: Activity[]
}

export default function RecentActivity({ activities: propActivities }: RecentActivityProps) {
  const { getActivities } = useDatabaseStore()
  const [activities, setActivities] = useState<Activity[]>(propActivities || [])
  const [loading, setLoading] = useState(!propActivities)

  useEffect(() => {
    if (propActivities) {
      setActivities(propActivities)
      setLoading(false)
    } else {
      // Simulate loading
      const timer = setTimeout(() => {
        setActivities(getActivities())
        setLoading(false)
      }, 1000)

      return () => clearTimeout(timer)
    }
  }, [propActivities, getActivities])

  const getActivityIcon = (type: string) => {
    switch (type) {
      case "payment_sent":
        return {
          icon: <ArrowUpRight className="h-4 w-4" />,
          bg: "bg-green-100",
          color: "text-green-600",
        }
      case "payment_received":
        return {
          icon: <ArrowDownRight className="h-4 w-4" />,
          bg: "bg-teal-100",
          color: "text-teal-600",
        }
      case "document_signed":
        return {
          icon: <FileText className="h-4 w-4" />,
          bg: "bg-purple-100",
          color: "text-purple-600",
        }
      case "message":
        return {
          icon: <MessageSquare className="h-4 w-4" />,
          bg: "bg-amber-100",
          color: "text-amber-600",
        }
      default:
        return {
          icon: <MessageSquare className="h-4 w-4" />,
          bg: "bg-neutral-100",
          color: "text-neutral-600",
        }
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-start space-x-3 animate-pulse">
            <div className="bg-neutral-200 p-2 rounded-full w-10 h-10"></div>
            <div className="flex-1 min-w-0">
              <div className="h-5 bg-neutral-200 rounded w-3/4 mb-2"></div>
              <div className="h-4 bg-neutral-200 rounded w-1/2 mb-2"></div>
              <div className="h-3 bg-neutral-200 rounded w-1/4"></div>
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {activities.map((activity) => {
        const { icon, bg, color } = getActivityIcon(activity.type)
        return (
          <div
            key={activity.id}
            className="flex items-start space-x-3 p-3 rounded-lg hover:bg-neutral-50 transition-colors"
          >
            <div className={`${bg} ${color} p-2 rounded-full flex items-center justify-center flex-shrink-0`}>
              {icon}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-teal-900">{activity.title}</p>
              <p className="text-sm text-neutral-600">{activity.description}</p>
              <p className="text-xs text-neutral-400 mt-1">{activity.time}</p>
            </div>
          </div>
        )
      })}
    </div>
  )
}
