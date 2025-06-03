"use client"

import { motion } from "framer-motion"

export default function LoadingScreen() {
  return (
    <div className="fixed inset-0 bg-white flex flex-col items-center justify-center z-50">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="flex flex-col items-center"
      >
        <div className="flex items-center mb-6">
          <div className="w-12 h-12 rounded-md bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center text-white font-bold mr-3">
            <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3, duration: 0.5 }}>
              CE
            </motion.span>
          </div>
          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4, duration: 0.5 }}
            className="text-2xl font-display font-semibold bg-clip-text text-transparent bg-gradient-to-r from-brand-700 to-brand-900"
          >
            CryptoEscrow
          </motion.span>
        </div>

        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.5, duration: 0.5 }}
          className="relative w-16 h-16 mb-4"
        >
          <motion.div
            animate={{
              rotate: 360,
            }}
            transition={{
              repeat: Number.POSITIVE_INFINITY,
              duration: 1.5,
              ease: "linear",
            }}
            className="absolute inset-0 border-4 border-t-brand-600 border-r-transparent border-b-transparent border-l-transparent rounded-full"
          />
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6, duration: 0.5 }}
          className="text-neutral-500 text-center"
        >
          Authenticating your session...
        </motion.p>
      </motion.div>
    </div>
  )
}
