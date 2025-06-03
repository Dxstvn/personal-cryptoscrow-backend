import Link from "next/link"
import { Facebook, Instagram, Linkedin, Twitter } from "lucide-react"

export default function Footer() {
  const currentYear = new Date().getFullYear()

  return (
    <footer className="bg-gradient-to-b from-white to-brand-50 border-t">
      <div className="container px-4 md:px-6 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="space-y-4">
            <div className="flex items-center">
              <div className="w-10 h-10 rounded-md bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center text-white font-bold mr-3">
                CE
              </div>
              <span className="text-xl font-display font-semibold bg-clip-text text-transparent bg-gradient-to-r from-brand-700 to-brand-900">
                CryptoEscrow
              </span>
            </div>
            <p className="text-sm text-neutral-600">
              Secure, transparent escrow services for real estate transactions using cryptocurrency.
            </p>
            <div className="flex space-x-4">
              <Link href="#" className="text-brand-500 hover:text-brand-600 transition-colors">
                <Twitter className="h-5 w-5" />
                <span className="sr-only">Twitter</span>
              </Link>
              <Link href="#" className="text-brand-500 hover:text-brand-600 transition-colors">
                <Facebook className="h-5 w-5" />
                <span className="sr-only">Facebook</span>
              </Link>
              <Link href="#" className="text-brand-500 hover:text-brand-600 transition-colors">
                <Instagram className="h-5 w-5" />
                <span className="sr-only">Instagram</span>
              </Link>
              <Link href="#" className="text-brand-500 hover:text-brand-600 transition-colors">
                <Linkedin className="h-5 w-5" />
                <span className="sr-only">LinkedIn</span>
              </Link>
            </div>
          </div>

          <div>
            <h3 className="font-semibold text-brand-900 mb-4">Product</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="#" className="text-neutral-600 hover:text-brand-600 transition-colors">
                  How It Works
                </Link>
              </li>
              <li>
                <Link href="#" className="text-neutral-600 hover:text-brand-600 transition-colors">
                  Features
                </Link>
              </li>
              <li>
                <Link href="#" className="text-neutral-600 hover:text-brand-600 transition-colors">
                  Pricing
                </Link>
              </li>
              <li>
                <Link href="#" className="text-neutral-600 hover:text-brand-600 transition-colors">
                  Security
                </Link>
              </li>
              <li>
                <Link href="#" className="text-neutral-600 hover:text-brand-600 transition-colors">
                  Compliance
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold text-brand-900 mb-4">Company</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="#" className="text-neutral-600 hover:text-brand-600 transition-colors">
                  About Us
                </Link>
              </li>
              <li>
                <Link href="#" className="text-neutral-600 hover:text-brand-600 transition-colors">
                  Careers
                </Link>
              </li>
              <li>
                <Link href="#" className="text-neutral-600 hover:text-brand-600 transition-colors">
                  Blog
                </Link>
              </li>
              <li>
                <Link href="#" className="text-neutral-600 hover:text-brand-600 transition-colors">
                  Press
                </Link>
              </li>
              <li>
                <Link href="#" className="text-neutral-600 hover:text-brand-600 transition-colors">
                  Contact
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold text-brand-900 mb-4">Legal</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="#" className="text-neutral-600 hover:text-brand-600 transition-colors">
                  Terms of Service
                </Link>
              </li>
              <li>
                <Link href="#" className="text-neutral-600 hover:text-brand-600 transition-colors">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link href="#" className="text-neutral-600 hover:text-brand-600 transition-colors">
                  Cookie Policy
                </Link>
              </li>
              <li>
                <Link href="#" className="text-neutral-600 hover:text-brand-600 transition-colors">
                  Compliance
                </Link>
              </li>
              <li>
                <Link href="#" className="text-neutral-600 hover:text-brand-600 transition-colors">
                  AML Policy
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t mt-12 pt-8 flex flex-col md:flex-row justify-between items-center">
          <p className="text-sm text-neutral-600">© {currentYear} CryptoEscrow. All rights reserved.</p>
          <p className="text-sm text-neutral-600 mt-4 md:mt-0">
            Cryptocurrency transactions are subject to applicable laws and regulations.
          </p>
        </div>
      </div>
    </footer>
  )
}
