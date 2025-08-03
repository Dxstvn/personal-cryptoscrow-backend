import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ComplianceReportingService } from '../complianceReportingService.js';
import fs from 'fs/promises';
import path from 'path';

// Mock dependencies
vi.mock('../../databaseService.js', () => ({
  getDb: vi.fn(() => mockDb)
}));

// Mock regular fs for createWriteStream
const mockStream = {
  on: vi.fn((event, callback) => {
    if (event === 'finish') setTimeout(callback, 10);
    return mockStream;
  }),
  write: vi.fn(),
  end: vi.fn()
};

vi.mock('fs', () => ({
  default: {
    createWriteStream: vi.fn(() => mockStream)
  },
  createWriteStream: vi.fn(() => mockStream)
}));

// Mock fs/promises
vi.mock('fs/promises', () => {
  const fsPromises = {
    mkdir: vi.fn(),
    writeFile: vi.fn(),
    unlink: vi.fn()
  };
  return {
    default: fsPromises,
    ...fsPromises
  };
});

vi.mock('exceljs', () => ({
  default: {
    Workbook: vi.fn(() => {
      const worksheet = {
        addRow: vi.fn(),
        columns: []
      };
      return {
        addWorksheet: vi.fn(() => worksheet),
        xlsx: {
          writeFile: vi.fn()
        }
      };
    })
  }
}));

vi.mock('pdfkit', () => {
  const mockDoc = {
    fontSize: vi.fn().mockReturnThis(),
    text: vi.fn().mockReturnThis(),
    moveDown: vi.fn().mockReturnThis(),
    pipe: vi.fn((stream) => stream),
    end: vi.fn()
  };
  const PDFDocument = vi.fn(() => mockDoc);
  return {
    default: PDFDocument
  };
});

// Mock Firestore
const mockCollection = vi.fn();
const mockDoc = vi.fn();
const mockGet = vi.fn();
const mockSet = vi.fn();
const mockUpdate = vi.fn();
const mockAdd = vi.fn();
const mockWhere = vi.fn();
const mockOrderBy = vi.fn();
const mockLimit = vi.fn();
const mockDelete = vi.fn();

const mockDb = {
  collection: mockCollection.mockReturnThis(),
  doc: mockDoc.mockReturnThis(),
  get: mockGet,
  set: mockSet,
  update: mockUpdate,
  add: mockAdd,
  where: mockWhere.mockReturnThis(),
  orderBy: mockOrderBy.mockReturnThis(),
  limit: mockLimit.mockReturnThis(),
  delete: mockDelete
};

describe('ComplianceReportingService', () => {
  let reportingService;

  beforeEach(() => {
    vi.clearAllMocks();
    reportingService = new ComplianceReportingService();
  });

  describe('generateReport', () => {
    it('should generate KYC summary report in PDF format', async () => {
      // Mock KYC data
      const mockUsers = [
        { data: () => ({ kycStatus: { status: 'approved', level: 'basic' } }) },
        { data: () => ({ kycStatus: { status: 'pending', level: 'none' } }) },
        { data: () => ({ kycStatus: { status: 'rejected', level: 'basic' } }) }
      ];

      const mockSessions = [
        {
          data: () => ({
            createdAt: new Date('2025-01-01'),
            completedAt: new Date('2025-01-02')
          })
        }
      ];

      mockGet.mockResolvedValueOnce({
        size: 3,
        forEach: callback => mockUsers.forEach(callback)
      }).mockResolvedValueOnce({
        forEach: callback => mockSessions.forEach(callback)
      });

      const result = await reportingService.generateReport(
        'kyc_summary',
        { startDate: '2025-01-01', endDate: '2025-01-31' },
        'pdf'
      );

      expect(result).toMatchObject({
        reportId: expect.any(String),
        reportType: 'kyc_summary',
        title: 'KYC Verification Summary Report',
        format: 'pdf',
        generatedAt: expect.any(Date),
        downloadUrl: expect.stringContaining('/api/reports/download/'),
        summary: expect.any(Object)
      });

      expect(fs.mkdir).toHaveBeenCalled();
      expect(mockSet).toHaveBeenCalled(); // Report metadata stored
    });

    it('should generate AML alerts report in Excel format', async () => {
      const mockUsersWithAlerts = [
        {
          data: () => ({
            firstName: 'John',
            lastName: 'Doe',
            amlStatus: {
              lastScreened: new Date('2025-01-15'),
              sanctions: {
                matches: [{ listSource: 'OFAC', matchedName: 'John Doe' }]
              },
              pep: { isPEP: true, details: { position: 'Minister' } },
              adverseMedia: { hasAdverseMedia: false }
            }
          }),
          id: 'user-1'
        }
      ];

      mockGet.mockResolvedValue({
        forEach: callback => mockUsersWithAlerts.forEach(callback)
      });

      const result = await reportingService.generateReport(
        'aml_alerts',
        {},
        'excel'
      );

      expect(result.format).toBe('excel');
      expect(result.reportType).toBe('aml_alerts');
      
      const ExcelJS = await import('exceljs');
      expect(ExcelJS.default.Workbook).toHaveBeenCalled();
    });

    it('should generate report in JSON format', async () => {
      mockGet.mockResolvedValue({
        size: 0,
        forEach: vi.fn()
      });

      const result = await reportingService.generateReport(
        'risk_assessment',
        {},
        'json'
      );

      expect(result.format).toBe('json');
      const writeFileCall = fs.writeFile.mock.calls[0];
      expect(writeFileCall[0]).toMatch(/risk_assessment.*\.json$/);
      // JSON.stringify adds spaces after colons
      expect(writeFileCall[1]).toContain('"reportType": "risk_assessment"');
      expect(writeFileCall[2]).toBe('utf8');
    });

    it('should handle unknown report type', async () => {
      await expect(
        reportingService.generateReport('unknown_report', {}, 'pdf')
      ).rejects.toThrow('Unknown report type');
    });

    it('should handle unsupported format', async () => {
      await expect(
        reportingService.generateReport('kyc_summary', {}, 'xml')
      ).rejects.toThrow('Unsupported format');
    });
  });

  describe('collectKYCSummaryData', () => {
    it('should collect comprehensive KYC statistics', async () => {
      const mockUsers = [
        { data: () => ({ kycStatus: { status: 'approved', level: 'basic' } }) },
        { data: () => ({ kycStatus: { status: 'approved', level: 'enhanced' } }) },
        { data: () => ({ kycStatus: { status: 'pending', level: 'none' } }) },
        { data: () => ({ kycStatus: { status: 'rejected', level: 'none' } }) },
        { data: () => ({}) } // No KYC status
      ];

      const mockSessions = [
        {
          data: () => ({
            createdAt: new Date('2025-01-15'),
            completedAt: new Date('2025-01-16')
          })
        },
        {
          data: () => ({
            createdAt: new Date('2025-01-20'),
            completedAt: null // Not completed
          })
        }
      ];

      mockCollection.mockReturnValueOnce({
        get: vi.fn().mockResolvedValue({
          size: 5,
          forEach: callback => mockUsers.forEach(callback)
        })
      }).mockReturnValueOnce({
        where: mockWhere,
        get: vi.fn().mockResolvedValue({
          forEach: callback => mockSessions.forEach(callback)
        })
      });

      const data = await reportingService.collectKYCSummaryData(
        mockDb,
        new Date('2025-01-01'),
        new Date('2025-01-31')
      );

      expect(data).toMatchObject({
        totalUsers: 5,
        verifiedUsers: 2,
        pendingVerifications: 1,
        rejectedVerifications: 1,
        verificationsByLevel: {
          none: 3,
          basic: 1,
          enhanced: 1
        },
        averageVerificationTime: expect.any(Number),
        dailyVerifications: expect.any(Array)
      });
    });
  });

  describe('collectAMLAlertsData', () => {
    it('should collect AML alert statistics', async () => {
      const mockUsersWithAlerts = [
        {
          data: () => ({
            firstName: 'John',
            lastName: 'Doe',
            amlStatus: {
              lastScreened: new Date('2025-01-15'),
              sanctions: {
                matches: [{ listSource: 'OFAC' }],
                lastChecked: new Date()
              },
              pep: {
                isPEP: true,
                details: { position: 'Minister' },
                lastChecked: new Date()
              },
              adverseMedia: {
                hasAdverseMedia: true,
                sources: ['News Article'],
                lastChecked: new Date()
              }
            }
          }),
          id: 'user-1'
        },
        {
          data: () => ({
            firstName: 'Jane',
            lastName: 'Smith',
            amlStatus: {
              lastScreened: new Date('2025-01-20'),
              sanctions: { matches: [] },
              pep: { isPEP: false },
              adverseMedia: { hasAdverseMedia: false }
            }
          }),
          id: 'user-2'
        }
      ];

      mockGet.mockResolvedValue({
        forEach: callback => mockUsersWithAlerts.forEach(callback)
      });

      const data = await reportingService.collectAMLAlertsData(
        mockDb,
        new Date('2025-01-01'),
        new Date('2025-01-31')
      );

      expect(data).toMatchObject({
        totalAlerts: 3,
        alertsByType: {
          sanctions: 1,
          pep: 1,
          adverseMedia: 1
        },
        alertsBySeverity: {
          critical: 1,
          high: 1,
          medium: 1,
          low: 0
        },
        alertDetails: expect.arrayContaining([
          expect.objectContaining({
            userId: 'user-1',
            type: 'sanctions',
            severity: 'critical'
          })
        ])
      });
    });
  });

  describe('collectRiskAssessmentData', () => {
    it('should collect risk assessment statistics', async () => {
      const mockAssessments = [
        {
          data: () => ({
            userId: 'user-1',
            riskLevel: 'high',
            overallScore: 75,
            riskComponents: {},
            createdAt: new Date('2025-01-15')
          })
        },
        {
          data: () => ({
            userId: 'user-2',
            riskLevel: 'low',
            overallScore: 20,
            riskComponents: {},
            createdAt: new Date('2025-01-15')
          })
        },
        {
          data: () => ({
            userId: 'user-3',
            riskLevel: 'critical',
            overallScore: 90,
            riskComponents: {},
            createdAt: new Date('2025-01-16')
          })
        }
      ];

      mockGet.mockResolvedValue({
        forEach: callback => mockAssessments.forEach(callback)
      });

      const data = await reportingService.collectRiskAssessmentData(
        mockDb,
        new Date('2025-01-01'),
        new Date('2025-01-31')
      );

      expect(data).toMatchObject({
        totalAssessments: 3,
        riskDistribution: {
          critical: 1,
          high: 1,
          medium: 0,
          low: 1,
          minimal: 0
        },
        averageRiskScore: 62, // (75+20+90)/3 ≈ 62
        highRiskUsers: expect.arrayContaining([
          expect.objectContaining({ riskLevel: 'critical' }),
          expect.objectContaining({ riskLevel: 'high' })
        ]),
        riskTrends: expect.arrayContaining([
          expect.objectContaining({
            date: '2025-01-15',
            averageScore: 48, // (75+20)/2
            count: 2
          })
        ])
      });
    });
  });

  describe('collectSuspiciousActivityData', () => {
    it('should collect SAR data', async () => {
      const mockSARs = [
        {
          data: () => ({
            id: 'sar-1',
            userId: 'user-1',
            status: 'submitted',
            activityType: 'structuring',
            amount: 9500,
            filedDate: new Date('2025-01-20'),
            filingNumber: 'SAR-2025-001',
            createdAt: new Date('2025-01-15')
          })
        },
        {
          data: () => ({
            id: 'sar-2',
            userId: 'user-2',
            status: 'draft',
            activityType: 'unusual_pattern',
            amount: 50000,
            createdAt: new Date('2025-01-18')
          })
        }
      ];

      mockGet.mockResolvedValue({
        forEach: callback => mockSARs.forEach(callback)
      });

      const data = await reportingService.collectSuspiciousActivityData(
        mockDb,
        new Date('2025-01-01'),
        new Date('2025-01-31')
      );

      expect(data).toMatchObject({
        totalSARs: 2,
        sarsByStatus: {
          draft: 1,
          submitted: 1,
          acknowledged: 0
        },
        sarsByType: {
          structuring: 1,
          unusual_pattern: 1
        },
        filedSARs: expect.arrayContaining([
          expect.objectContaining({
            sarId: 'sar-1',
            filingNumber: 'SAR-2025-001'
          })
        ]),
        pendingSARs: expect.arrayContaining([
          expect.objectContaining({
            sarId: 'sar-2',
            daysOpen: expect.any(Number)
          })
        ])
      });
    });
  });

  describe('collectAuditTrailData', () => {
    it('should collect audit trail data with filters', async () => {
      const mockAudits = [
        {
          data: () => ({
            action: 'kyc_approved',
            userId: 'user-1',
            timestamp: new Date('2025-01-15'),
            performedBy: 'admin-1',
            result: 'success'
          })
        },
        {
          data: () => ({
            action: 'manual_review_required',
            userId: 'user-2',
            timestamp: new Date('2025-01-16'),
            performedBy: 'system',
            details: { reason: 'High risk score' },
            result: 'success'
          })
        }
      ];

      mockGet.mockResolvedValue({
        forEach: callback => mockAudits.forEach(callback)
      });

      const data = await reportingService.collectAuditTrailData(
        mockDb,
        new Date('2025-01-01'),
        new Date('2025-01-31'),
        { userId: 'user-1' }
      );

      expect(data).toMatchObject({
        totalAudits: 2,
        auditsByAction: {
          kyc_approved: 1,
          manual_review_required: 1
        },
        auditsByUser: {
          'user-1': 1,
          'user-2': 1
        },
        criticalActions: expect.arrayContaining([
          expect.objectContaining({
            action: 'manual_review_required'
          })
        ]),
        timeline: expect.any(Array)
      });
    });
  });

  describe('PDF Generation', () => {
    it('should create PDF with correct structure', async () => {
      const pdfkitModule = await import('pdfkit');
      const PDFDocument = pdfkitModule.default;
      const mockDoc = PDFDocument();

      mockGet.mockResolvedValue({
        size: 0,
        forEach: vi.fn()
      });

      // Mock fs.createWriteStream
      const mockStream = {
        on: vi.fn((event, callback) => {
          if (event === 'finish') setTimeout(callback, 10);
        })
      };
      mockDoc.pipe.mockReturnValue(mockStream);

      await reportingService.generateReport('kyc_summary', {}, 'pdf');

      expect(mockDoc.fontSize).toHaveBeenCalledWith(20);
      expect(mockDoc.text).toHaveBeenCalledWith(
        'KYC Verification Summary Report',
        expect.any(Object)
      );
      expect(mockDoc.end).toHaveBeenCalled();
    });

    it('should add parameters to PDF when provided', async () => {
      const pdfkitModule = await import('pdfkit');
      const PDFDocument = pdfkitModule.default;
      const mockDoc = PDFDocument();

      mockGet.mockResolvedValue({
        size: 0,
        forEach: vi.fn()
      });

      const mockStream = {
        on: vi.fn((event, callback) => {
          if (event === 'finish') setTimeout(callback, 10);
        })
      };
      mockDoc.pipe.mockReturnValue(mockStream);

      await reportingService.generateReport(
        'kyc_summary',
        { startDate: '2025-01-01', endDate: '2025-01-31' },
        'pdf'
      );

      expect(mockDoc.text).toHaveBeenCalledWith(
        'Report Parameters:',
        expect.any(Object)
      );
    });
  });

  describe('Excel Generation', () => {
    it('should create Excel with correct structure', async () => {
      // Setup mock data
      mockGet.mockResolvedValue({
        size: 3,
        forEach: callback => {
          [
            { data: () => ({ kycStatus: { status: 'approved' } }) },
            { data: () => ({ kycStatus: { status: 'pending' } }) },
            { data: () => ({ kycStatus: { status: 'rejected' } }) }
          ].forEach(callback);
        }
      });

      // Mock KYC sessions for date calculations
      mockCollection.mockReturnValueOnce({
        get: vi.fn().mockResolvedValue({
          size: 3,
          forEach: vi.fn()
        })
      }).mockReturnValueOnce({
        where: mockWhere,
        get: vi.fn().mockResolvedValue({
          forEach: vi.fn()
        })
      });

      await reportingService.generateReport('kyc_summary', {}, 'excel');

      // Check that ExcelJS was used
      const ExcelJS = await import('exceljs');
      expect(ExcelJS.default.Workbook).toHaveBeenCalled();
      
      // Get the mocked instances
      const mockWorkbook = ExcelJS.default.Workbook.mock.results[0].value;
      expect(mockWorkbook.addWorksheet).toHaveBeenCalledWith('Report');
      expect(mockWorkbook.xlsx.writeFile).toHaveBeenCalled();
    });
  });

  describe('getDateRange', () => {
    it('should parse date parameters correctly', () => {
      const { startDate, endDate } = reportingService.getDateRange({
        startDate: '2025-01-01',
        endDate: '2025-01-31'
      });

      expect(startDate).toEqual(new Date('2025-01-01'));
      expect(endDate).toEqual(new Date('2025-01-31'));
    });

    it('should use default 30-day range when not provided', () => {
      const { startDate, endDate } = reportingService.getDateRange({});

      const daysDiff = (endDate - startDate) / (1000 * 60 * 60 * 24);
      expect(daysDiff).toBeCloseTo(30, 0);
    });
  });

  describe('scheduleAutomatedReports', () => {
    it('should configure scheduled reports', async () => {
      await reportingService.scheduleAutomatedReports();

      expect(mockSet).toHaveBeenCalledTimes(4); // 4 scheduled reports

      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({
          reportType: 'kyc_summary',
          frequency: 'daily',
          time: '09:00',
          format: 'pdf',
          enabled: true
        })
      );
    });
  });

  describe('processScheduledReports', () => {
    it('should process due scheduled reports', async () => {
      const mockScheduledReports = [
        {
          data: () => ({
            reportType: 'kyc_summary',
            format: 'pdf',
            recipients: ['test@example.com'],
            nextRun: new Date(Date.now() - 1000),
            frequency: 'daily',
            time: '09:00'
          }),
          ref: { update: vi.fn() }
        }
      ];

      mockGet.mockResolvedValueOnce({
        docs: mockScheduledReports,
        forEach: callback => mockScheduledReports.forEach(callback)
      });

      // Mock report generation data
      mockGet.mockResolvedValue({
        size: 0,
        forEach: vi.fn()
      });

      await reportingService.processScheduledReports();

      expect(mockScheduledReports[0].ref.update).toHaveBeenCalledWith(
        expect.objectContaining({
          lastRun: expect.any(Date),
          nextRun: expect.any(Date),
          lastRunStatus: 'success'
        })
      );
    });

    it('should handle report generation failures', async () => {
      const mockDoc = {
        data: () => ({
          reportType: 'invalid_report',
          format: 'pdf'
        }),
        ref: { update: vi.fn() }
      };

      mockGet.mockResolvedValueOnce({
        docs: [mockDoc],
        forEach: callback => callback(mockDoc)
      });

      await reportingService.processScheduledReports();

      expect(mockDoc.ref.update).toHaveBeenCalledWith(
        expect.objectContaining({
          lastRunStatus: 'failed',
          lastRunError: expect.any(String)
        })
      );
    });
  });

  describe('cleanupOldReports', () => {
    it('should delete expired reports', async () => {
      const mockExpiredReports = [
        {
          data: () => ({
            filePath: '/reports/old-report.pdf',
            expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000)
          }),
          ref: { delete: mockDelete }
        }
      ];

      mockGet.mockResolvedValue({
        docs: mockExpiredReports,
        forEach: callback => mockExpiredReports.forEach(callback)
      });

      await reportingService.cleanupOldReports();

      const fsPromises = await import('fs/promises');
      expect(fsPromises.unlink).toHaveBeenCalledWith('/reports/old-report.pdf');
      expect(mockDelete).toHaveBeenCalled();
    });

    it('should handle file deletion errors gracefully', async () => {
      const fsPromises = await import('fs/promises');
      fsPromises.unlink.mockRejectedValueOnce(new Error('File not found'));

      const mockDoc = {
        data: () => ({ filePath: '/reports/missing.pdf' }),
        ref: { delete: mockDelete }
      };

      mockGet.mockResolvedValue({
        docs: [mockDoc],
        forEach: callback => callback(mockDoc)
      });

      await reportingService.cleanupOldReports();

      // Should still delete metadata even if file is missing
      expect(mockDelete).toHaveBeenCalled();
    });
  });

  describe('calculateNextRun', () => {
    it('should calculate next run time for daily reports', () => {
      const schedule = {
        frequency: 'daily',
        time: '09:00'
      };

      const nextRun = reportingService.calculateNextRun(schedule);

      expect(nextRun.getHours()).toBe(9);
      expect(nextRun.getMinutes()).toBe(0);
      expect(nextRun).toBeInstanceOf(Date);
    });

    it('should calculate next run time for weekly reports', () => {
      const schedule = {
        frequency: 'weekly',
        dayOfWeek: 1, // Monday
        time: '09:00'
      };

      const nextRun = reportingService.calculateNextRun(schedule);

      expect(nextRun.getDay()).toBe(1); // Monday
      expect(nextRun.getHours()).toBe(9);
    });

    it('should calculate next run time for monthly reports', () => {
      const schedule = {
        frequency: 'monthly',
        dayOfMonth: 15,
        time: '09:00'
      };

      const nextRun = reportingService.calculateNextRun(schedule);

      expect(nextRun.getDate()).toBe(15);
      expect(nextRun.getHours()).toBe(9);
    });
  });

  describe('Performance Tests', () => {
    it('should generate reports efficiently', async () => {
      mockGet.mockResolvedValue({
        size: 100,
        forEach: callback => {
          // Mock 100 users
          for (let i = 0; i < 100; i++) {
            callback({
              data: () => ({ kycStatus: { status: 'approved' } })
            });
          }
        }
      });

      const startTime = Date.now();
      
      await reportingService.generateReport('kyc_summary', {}, 'json');
      
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(5000);
    });

    it('should handle large datasets', async () => {
      const largeMockData = Array(1000).fill(null).map((_, i) => ({
        data: () => ({
          userId: `user-${i}`,
          action: 'kyc_verification',
          timestamp: new Date()
        })
      }));

      mockGet.mockResolvedValue({
        forEach: callback => largeMockData.forEach(callback)
      });

      const data = await reportingService.collectAuditTrailData(
        mockDb,
        new Date('2025-01-01'),
        new Date('2025-01-31'),
        {}
      );

      expect(data.totalAudits).toBe(1000);
      expect(data.timeline).toHaveLength(1000);
    });
  });
});