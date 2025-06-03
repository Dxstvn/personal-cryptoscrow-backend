import { Building2, DollarSign, FileText } from "lucide-react"

export default function DashboardStats() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <div className="bg-white rounded-lg p-6">
        <div className="flex justify-between items-start mb-4">
          <div>
            <p className="text-gray-500 text-sm">Active Transactions</p>
            <p className="text-4xl font-bold mt-1">2</p>
          </div>
          <div className="bg-gray-100 p-2 rounded-md">
            <Building2 className="h-5 w-5 text-gray-500" />
          </div>
        </div>
        <div className="flex items-center text-sm text-green-600">
          <span className="mr-1">+1</span>
          <span className="text-gray-500">from last month</span>
        </div>
      </div>

      <div className="bg-white rounded-lg p-6">
        <div className="flex justify-between items-start mb-4">
          <div>
            <p className="text-gray-500 text-sm">Total Value Locked</p>
            <p className="text-4xl font-bold mt-1">$152,500</p>
          </div>
          <div className="bg-gray-100 p-2 rounded-md">
            <DollarSign className="h-5 w-5 text-gray-500" />
          </div>
        </div>
        <div className="flex items-center text-sm text-green-600">
          <span className="mr-1">+12%</span>
          <span className="text-gray-500">from last month</span>
        </div>
      </div>

      <div className="bg-white rounded-lg p-6">
        <div className="flex justify-between items-start mb-4">
          <div>
            <p className="text-gray-500 text-sm">Completed Transactions</p>
            <p className="text-4xl font-bold mt-1">12</p>
          </div>
          <div className="bg-gray-100 p-2 rounded-md">
            <FileText className="h-5 w-5 text-gray-500" />
          </div>
        </div>
        <div className="flex items-center text-sm text-green-600">
          <span className="mr-1">+3</span>
          <span className="text-gray-500">from last month</span>
        </div>
      </div>
    </div>
  )
}
