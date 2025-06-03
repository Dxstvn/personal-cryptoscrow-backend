"use client"

import { Calendar, Clock } from "lucide-react"
import { useDatabaseStore } from "@/lib/mock-database"
import { useState, useEffect } from "react"

interface Deadline {
  id: number
  title: string
  date: string
  time: string
  transaction: string
}

interface UpcomingDeadlinesProps {
  deadlines?: Deadline[]
}

export default function UpcomingDeadlines({ deadlines: propDeadlines }: UpcomingDeadlinesProps) {
  const { getDeadlines } = useDatabaseStore()
  const [deadlines, setDeadlines] = useState<Deadline[]>(propDeadlines || [])
  const [loading, setLoading] = useState(!propDeadlines)

  useEffect(() => {
    if (propDeadlines) {
      setDeadlines(propDeadlines)
      setLoading(false)
    } else {
      // Simulate loading
      const timer = setTimeout(() => {
        setDeadlines(getDeadlines())
        setLoading(false)
      }, 1000)

      return () => clearTimeout(timer)
    }
  }, [propDeadlines, getDeadlines])

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-teal-800/50 rounded-lg p-4 animate-pulse">
            <div className="h-5 bg-teal-700/50 rounded w-3/4 mb-3"></div>
            <div className="space-y-2">
              <div className="flex items-center">
                <div className="w-4 h-4 bg-teal-700/50 rounded-full mr-2"></div>
                <div className="h-4 bg-teal-700/50 rounded w-1/2"></div>
              </div>
              <div className="flex items-center">
                <div className="w-4 h-4 bg-teal-700/50 rounded-full mr-2"></div>
                <div className="h-4 bg-teal-700/50 rounded w-1/3"></div>
              </div>
            </div>
            <div className="h-3 bg-teal-700/50 rounded w-1/4 mt-2"></div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {deadlines.map((deadline, index) => (
        <div
          key={deadline.id}
          className="bg-teal-800/50 backdrop-blur-sm rounded-lg p-4 hover:bg-teal-800/70 transition-all duration-300 animate-slide-in-right border border-teal-700/30"
          style={{ animationDelay: `${index * 0.1}s` }}
        >
          <h3 className="font-medium text-white font-display">{deadline.title}</h3>
          <div className="mt-2 space-y-2 text-sm text-teal-100">
            <div className="flex items-center">
              <Calendar className="h-4 w-4 mr-2 text-gold-400" />
              <span>{deadline.date}</span>
            </div>
            <div className="flex items-center">
              <Clock className="h-4 w-4 mr-2 text-gold-400" />
              <span>{deadline.time}</span>
            </div>
          </div>
          <div className="mt-2 text-xs text-teal-300">Transaction: {deadline.transaction}</div>
        </div>
      ))}
    </div>
  )
}
