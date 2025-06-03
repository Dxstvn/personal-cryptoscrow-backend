import { ArrowUpRight, ArrowDownRight, FileText, MessageSquare } from "lucide-react"

export default function RecentActivity() {
  const activities = [
    {
      id: 1,
      type: "payment_sent",
      title: "Payment Sent",
      description: "You sent 2.5 ETH to John Smith",
      time: "2 hours ago",
      icon: <ArrowUpRight className="h-4 w-4" />,
      iconBg: "bg-green-100",
      iconColor: "text-green-600",
    },
    {
      id: 2,
      type: "payment_received",
      title: "Payment Received",
      description: "You received 0.5 BTC from Sarah Johnson",
      time: "Yesterday",
      icon: <ArrowDownRight className="h-4 w-4" />,
      iconBg: "bg-blue-100",
      iconColor: "text-blue-600",
    },
    {
      id: 3,
      type: "document_signed",
      title: "Document Signed",
      description: "Purchase agreement signed by all parties",
      time: "2 days ago",
      icon: <FileText className="h-4 w-4" />,
      iconBg: "bg-purple-100",
      iconColor: "text-purple-600",
    },
    {
      id: 4,
      type: "message",
      title: "New Message",
      description: "Michael Chen sent you a message",
      time: "3 days ago",
      icon: <MessageSquare className="h-4 w-4" />,
      iconBg: "bg-yellow-100",
      iconColor: "text-yellow-600",
    },
  ]

  return (
    <div className="space-y-4">
      {activities.map((activity) => (
        <div key={activity.id} className="flex items-start space-x-3">
          <div
            className={`${activity.iconBg} ${activity.iconColor} p-2 rounded-full flex items-center justify-center flex-shrink-0`}
          >
            {activity.icon}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium">{activity.title}</p>
            <p className="text-sm text-gray-500">{activity.description}</p>
            <p className="text-xs text-gray-400 mt-1">{activity.time}</p>
          </div>
        </div>
      ))}
    </div>
  )
}
