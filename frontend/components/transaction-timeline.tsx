import { CheckCircle, Clock } from "lucide-react"

export default function TransactionTimeline() {
  const timelineEvents = [
    {
      id: 1,
      title: "Transaction Created",
      description: "Transaction was initiated by John Smith",
      date: "April 15, 2023",
      time: "10:30 AM",
      status: "completed",
    },
    {
      id: 2,
      title: "Verification Process",
      description: "Identity verification in progress",
      date: "April 15, 2023",
      time: "11:45 AM",
      status: "in_progress",
    },
    {
      id: 3,
      title: "Awaiting Funds",
      description: "Waiting for funds to be deposited into escrow",
      date: "Pending",
      time: "",
      status: "pending",
    },
    {
      id: 4,
      title: "In Escrow",
      description: "Funds held in secure escrow",
      date: "Pending",
      time: "",
      status: "pending",
    },
    {
      id: 5,
      title: "Transaction Complete",
      description: "Funds released to recipient",
      date: "Pending",
      time: "",
      status: "pending",
    },
  ]

  return (
    <div className="relative">
      <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200" />
      <div className="space-y-8">
        {timelineEvents.map((event) => (
          <div key={event.id} className="relative pl-10">
            <div
              className={`absolute left-0 p-1.5 rounded-full ${
                event.status === "completed"
                  ? "bg-green-100 text-green-600"
                  : event.status === "in_progress"
                    ? "bg-blue-100 text-blue-600"
                    : "bg-gray-100 text-gray-400"
              }`}
            >
              {event.status === "completed" ? <CheckCircle className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
            </div>
            <div>
              <h3 className="font-medium">{event.title}</h3>
              <p className="text-sm text-gray-500 mt-1">{event.description}</p>
              {event.status !== "pending" && (
                <p className="text-xs text-gray-400 mt-2">
                  {event.date} {event.time && `• ${event.time}`}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
