"use client"

import { useEffect } from "react"

export default function DomainLogger() {
  useEffect(() => {
    // Log the current domain with styling
    console.log(
      "%c CURRENT DOMAIN INFO ",
      "background: #3b82f6; color: white; font-weight: bold; padding: 4px; border-radius: 4px;",
    )
    console.log("Domain:", window.location.hostname)
    console.log("Full URL:", window.location.href)
    console.log("Mock backend enabled - no Firebase configuration needed")
  }, [])

  return null
}
