import { Star } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"

export default function TestimonialSection() {
  const testimonials = [
    {
      quote:
        "CryptoEscrow made our international property purchase seamless. The smart contract gave us peace of mind throughout the entire process.",
      author: "Michael Chen",
      role: "Property Investor",
      rating: 5,
    },
    {
      quote:
        "As a real estate agency, we've reduced transaction times by 70% using this platform. Our clients love the transparency and security.",
      author: "Sarah Johnson",
      role: "Real Estate Agent",
      rating: 5,
    },
    {
      quote:
        "The compliance features helped us navigate the complex regulatory landscape while still enjoying the benefits of cryptocurrency transactions.",
      author: "David Rodriguez",
      role: "Property Developer",
      rating: 4,
    },
  ]

  return (
    <section className="py-24 bg-white">
      <div className="container px-4 md:px-6">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl bg-clip-text text-transparent bg-gradient-to-r from-brand-700 to-brand-900">
            What Our Clients Say
          </h2>
          <p className="mt-4 text-lg text-neutral-600 max-w-3xl mx-auto">
            Hear from property buyers, sellers, and agencies who have transformed their real estate transactions.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {testimonials.map((testimonial, index) => (
            <Card
              key={index}
              className="border-0 shadow-soft hover:shadow-lg transition-all duration-300 overflow-hidden"
            >
              <CardContent className="p-8 relative">
                {/* Decorative quote mark */}
                <div className="absolute top-4 right-4 text-6xl text-brand-100 font-serif">"</div>

                <div className="flex mb-4">
                  {Array(testimonial.rating)
                    .fill(0)
                    .map((_, i) => (
                      <Star key={i} className="h-5 w-5 text-yellow-400 fill-yellow-400" />
                    ))}
                </div>
                <blockquote className="text-lg mb-6 relative z-10">"{testimonial.quote}"</blockquote>
                <div className="flex items-center">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-brand-100 to-brand-200 flex items-center justify-center text-brand-800 font-semibold mr-3">
                    {testimonial.author
                      .split(" ")
                      .map((name) => name[0])
                      .join("")}
                  </div>
                  <div>
                    <p className="font-semibold text-brand-900">{testimonial.author}</p>
                    <p className="text-sm text-brand-600">{testimonial.role}</p>
                  </div>
                </div>

                {/* Decorative element */}
                <div className="absolute bottom-0 left-0 w-full h-1 bg-gradient-to-r from-brand-400 to-purple-400"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  )
}
