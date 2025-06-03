import { Calendar, Clock } from "lucide-react"

export default function UpcomingDeadlines() {
  const deadlines = [
    {
      id: 1,
      title: "Escrow Funding Deadline",
      date: "April 20, 2023",
      time: "11:59 PM EST",
      transaction: "TX123456",
    },
    {
      id: 2,
      title: "Document Submission",
      date: "April 25, 2023",
      time: "5:00 PM EST",
      transaction: "TX789012",
    },
    {
      id: 3,
      title: "Final Inspection",
      date: "May 2, 2023",
      time: "10:00 AM EST",
      transaction: "TX123456",
    },
  ]

  return (
    <div className="space-y-4">
      {deadlines.map((deadline) => (
        <div key={deadline.id} className="border border-gray-200 rounded-lg p-4">
          <h3 className="font-medium">{deadline.title}</h3>
          <div className="mt-2 space-y-2 text-sm text-gray-500">
            <div className="flex items-center">
              <Calendar className="h-4 w-4 mr-2" />
              <span>{deadline.date}</span>
            </div>
            <div className="flex items-center">
              <Clock className="h-4 w-4 mr-2" />
              <span>{deadline.time}</span>
            </div>
          </div>
          <div className="mt-2 text-xs text-gray-400">Transaction: {deadline.transaction}</div>
        </div>
      ))}
    </div>
  )
}
