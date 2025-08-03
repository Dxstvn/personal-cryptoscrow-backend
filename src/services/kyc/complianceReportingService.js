// src/services/kyc/complianceReportingService.js

import { getDb } from '../databaseService.js';
import { v4 as uuidv4 } from 'uuid';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import fs from 'fs';
import * as fsPromises from 'fs/promises';
import path from 'path';

/**
 * Compliance Reporting Service
 * Generates various compliance reports for regulatory requirements
 */
export class ComplianceReportingService {
  constructor() {
    this.reportTypes = {
      'kyc_summary': 'KYC Verification Summary Report',
      'aml_alerts': 'AML Screening Alerts Report', 
      'risk_assessment': 'Risk Assessment Report',
      'transaction_monitoring': 'Transaction Monitoring Report',
      'suspicious_activity': 'Suspicious Activity Report (SAR)',
      'regulatory_filing': 'Regulatory Filing Report',
      'audit_trail': 'Compliance Audit Trail Report',
      'user_verification': 'User Verification Status Report',
      'document_expiry': 'Document Expiry Report',
      'manual_review': 'Manual Review Queue Report'
    };
  }

  /**
   * Generate a compliance report
   * @param {string} reportType - Type of report to generate
   * @param {Object} parameters - Report parameters (date range, filters, etc.)
   * @param {string} format - Output format (pdf, excel, json)
   * @returns {Promise<Object>} Report details with download URL
   */
  async generateReport(reportType, parameters = {}, format = 'pdf') {
    console.log(`[ComplianceReporting] Generating ${reportType} report in ${format} format`);

    if (!this.reportTypes[reportType]) {
      throw new Error(`Unknown report type: ${reportType}`);
    }

    try {
      // Collect report data
      const reportData = await this.collectReportData(reportType, parameters);

      // Generate report in requested format
      let reportPath;
      switch (format) {
        case 'pdf':
          reportPath = await this.generatePDFReport(reportType, reportData, parameters);
          break;
        case 'excel':
          reportPath = await this.generateExcelReport(reportType, reportData, parameters);
          break;
        case 'json':
          reportPath = await this.generateJSONReport(reportType, reportData, parameters);
          break;
        default:
          throw new Error(`Unsupported format: ${format}`);
      }

      // Store report metadata
      const reportId = await this.storeReportMetadata(reportType, parameters, format, reportPath);

      // Get temporary download URL
      const downloadUrl = await this.getReportDownloadUrl(reportPath);

      return {
        reportId,
        reportType,
        title: this.reportTypes[reportType],
        format,
        generatedAt: new Date(),
        downloadUrl,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
        parameters,
        summary: this.generateReportSummary(reportData)
      };
    } catch (error) {
      console.error('[ComplianceReporting] Error generating report:', error);
      throw error;
    }
  }

  /**
   * Collect data for the report based on type
   */
  async collectReportData(reportType, parameters) {
    const db = await getDb();
    const { startDate, endDate } = this.getDateRange(parameters);

    switch (reportType) {
      case 'kyc_summary':
        return await this.collectKYCSummaryData(db, startDate, endDate);
      
      case 'aml_alerts':
        return await this.collectAMLAlertsData(db, startDate, endDate);
      
      case 'risk_assessment':
        return await this.collectRiskAssessmentData(db, startDate, endDate);
      
      case 'transaction_monitoring':
        return await this.collectTransactionMonitoringData(db, startDate, endDate, parameters);
      
      case 'suspicious_activity':
        return await this.collectSuspiciousActivityData(db, startDate, endDate);
      
      case 'regulatory_filing':
        return await this.collectRegulatoryFilingData(db, startDate, endDate, parameters);
      
      case 'audit_trail':
        return await this.collectAuditTrailData(db, startDate, endDate, parameters);
      
      case 'user_verification':
        return await this.collectUserVerificationData(db);
      
      case 'document_expiry':
        return await this.collectDocumentExpiryData(db);
      
      case 'manual_review':
        return await this.collectManualReviewData(db);
      
      default:
        throw new Error(`Data collection not implemented for: ${reportType}`);
    }
  }

  /**
   * Collect KYC summary data
   */
  async collectKYCSummaryData(db, startDate, endDate) {
    const data = {
      totalUsers: 0,
      verifiedUsers: 0,
      pendingVerifications: 0,
      rejectedVerifications: 0,
      verificationsByLevel: {},
      averageVerificationTime: 0,
      documentTypes: {},
      topRejectionReasons: [],
      dailyVerifications: []
    };

    // Get all users
    const usersSnapshot = await db.collection('users').get();
    data.totalUsers = usersSnapshot.size;

    // Count by KYC status
    usersSnapshot.forEach(doc => {
      const user = doc.data();
      const kycStatus = user.kycStatus?.status || 'none';
      
      if (kycStatus === 'approved') data.verifiedUsers++;
      else if (kycStatus === 'pending' || kycStatus === 'in_progress') data.pendingVerifications++;
      else if (kycStatus === 'rejected') data.rejectedVerifications++;

      // Count by level
      const level = user.kycStatus?.level || 'none';
      data.verificationsByLevel[level] = (data.verificationsByLevel[level] || 0) + 1;
    });

    // Get KYC sessions for time-based data
    const sessionsSnapshot = await db.collection('kycSessions')
      .where('createdAt', '>=', startDate)
      .where('createdAt', '<=', endDate)
      .get();

    // Calculate average verification time
    let totalTime = 0;
    let completedCount = 0;

    sessionsSnapshot.forEach(doc => {
      const session = doc.data();
      if (session.completedAt && session.createdAt) {
        const completedAt = session.completedAt instanceof Date ? session.completedAt : new Date(session.completedAt);
        const createdAt = session.createdAt instanceof Date ? session.createdAt : new Date(session.createdAt);
        const time = completedAt - createdAt;
        totalTime += time;
        completedCount++;
      }
    });

    if (completedCount > 0) {
      data.averageVerificationTime = Math.round(totalTime / completedCount / (1000 * 60)); // in minutes
    }

    // Get daily verification counts
    const dailyCounts = {};
    sessionsSnapshot.forEach(doc => {
      const session = doc.data();
      if (session.createdAt) {
        const createdAt = session.createdAt instanceof Date ? session.createdAt : new Date(session.createdAt);
        const date = createdAt.toISOString().split('T')[0];
        dailyCounts[date] = (dailyCounts[date] || 0) + 1;
      }
    });

    data.dailyVerifications = Object.entries(dailyCounts).map(([date, count]) => ({
      date,
      count
    }));

    return data;
  }

  /**
   * Collect AML alerts data
   */
  async collectAMLAlertsData(db, startDate, endDate) {
    const data = {
      totalAlerts: 0,
      alertsByType: {
        sanctions: 0,
        pep: 0,
        adverseMedia: 0
      },
      alertsBySeverity: {
        critical: 0,
        high: 0,
        medium: 0,
        low: 0
      },
      resolvedAlerts: 0,
      pendingAlerts: 0,
      falsePositives: 0,
      alertDetails: []
    };

    // Query users with AML alerts
    const usersWithAlerts = await db.collection('users')
      .where('amlStatus.lastScreened', '>=', startDate)
      .where('amlStatus.lastScreened', '<=', endDate)
      .get();

    usersWithAlerts.forEach(doc => {
      const user = doc.data();
      const amlStatus = user.amlStatus || {};

      // Check for sanctions matches
      if (amlStatus.sanctions?.matches?.length > 0) {
        data.alertsByType.sanctions++;
        data.totalAlerts++;
        
        amlStatus.sanctions.matches.forEach(match => {
          data.alertDetails.push({
            userId: doc.id,
            userName: `${user.firstName} ${user.lastName}`,
            type: 'sanctions',
            severity: 'critical',
            details: match,
            date: amlStatus.sanctions.lastChecked
          });
        });
      }

      // Check for PEP status
      if (amlStatus.pep?.isPEP) {
        data.alertsByType.pep++;
        data.totalAlerts++;
        
        data.alertDetails.push({
          userId: doc.id,
          userName: `${user.firstName} ${user.lastName}`,
          type: 'pep',
          severity: 'high',
          details: amlStatus.pep.details,
          date: amlStatus.pep.lastChecked
        });
      }

      // Check for adverse media
      if (amlStatus.adverseMedia?.hasAdverseMedia) {
        data.alertsByType.adverseMedia++;
        data.totalAlerts++;
        
        data.alertDetails.push({
          userId: doc.id,
          userName: `${user.firstName} ${user.lastName}`,
          type: 'adverseMedia',
          severity: 'medium',
          details: amlStatus.adverseMedia.sources,
          date: amlStatus.adverseMedia.lastChecked
        });
      }
    });

    // Count by severity
    data.alertDetails.forEach(alert => {
      data.alertsBySeverity[alert.severity]++;
    });

    return data;
  }

  /**
   * Collect risk assessment data
   */
  async collectRiskAssessmentData(db, startDate, endDate) {
    const data = {
      totalAssessments: 0,
      riskDistribution: {
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
        minimal: 0
      },
      averageRiskScore: 0,
      riskFactorAnalysis: {},
      highRiskUsers: [],
      riskTrends: []
    };

    // Get risk assessments
    const assessmentsSnapshot = await db.collection('riskAssessments')
      .where('createdAt', '>=', startDate)
      .where('createdAt', '<=', endDate)
      .orderBy('createdAt', 'desc')
      .get();

    let totalScore = 0;
    const dailyRisks = {};

    assessmentsSnapshot.forEach(doc => {
      const assessment = doc.data();
      data.totalAssessments++;
      
      // Count by risk level
      data.riskDistribution[assessment.riskLevel]++;
      
      // Sum scores for average
      totalScore += assessment.overallScore;
      
      // Track high risk users
      if (assessment.riskLevel === 'critical' || assessment.riskLevel === 'high') {
        data.highRiskUsers.push({
          userId: assessment.userId,
          riskLevel: assessment.riskLevel,
          score: assessment.overallScore,
          factors: assessment.riskComponents,
          date: assessment.createdAt
        });
      }

      // Track daily trends
      const date = new Date(assessment.createdAt).toISOString().split('T')[0];
      if (!dailyRisks[date]) {
        dailyRisks[date] = { total: 0, sum: 0 };
      }
      dailyRisks[date].total++;
      dailyRisks[date].sum += assessment.overallScore;
    });

    // Calculate average
    if (data.totalAssessments > 0) {
      data.averageRiskScore = Math.round(totalScore / data.totalAssessments);
    }

    // Generate trends
    data.riskTrends = Object.entries(dailyRisks).map(([date, stats]) => ({
      date,
      averageScore: Math.round(stats.sum / stats.total),
      count: stats.total
    }));

    return data;
  }

  /**
   * Collect suspicious activity data
   */
  async collectSuspiciousActivityData(db, startDate, endDate) {
    const data = {
      totalSARs: 0,
      sarsByStatus: {
        draft: 0,
        submitted: 0,
        acknowledged: 0
      },
      sarsByType: {},
      filedSARs: [],
      pendingSARs: []
    };

    // Get suspicious activity reports
    const sarsSnapshot = await db.collection('suspiciousActivityReports')
      .where('createdAt', '>=', startDate)
      .where('createdAt', '<=', endDate)
      .get();

    sarsSnapshot.forEach(doc => {
      const sar = doc.data();
      data.totalSARs++;
      
      // Count by status
      data.sarsByStatus[sar.status]++;
      
      // Count by type
      data.sarsByType[sar.activityType] = (data.sarsByType[sar.activityType] || 0) + 1;
      
      // Separate filed vs pending
      if (sar.status === 'submitted' || sar.status === 'acknowledged') {
        data.filedSARs.push({
          sarId: sar.id,
          userId: sar.userId,
          activityType: sar.activityType,
          amount: sar.amount,
          filedDate: sar.filedDate,
          filingNumber: sar.filingNumber
        });
      } else {
        data.pendingSARs.push({
          sarId: sar.id,
          userId: sar.userId,
          activityType: sar.activityType,
          amount: sar.amount,
          createdDate: sar.createdAt,
          daysOpen: Math.floor((new Date() - new Date(sar.createdAt)) / (1000 * 60 * 60 * 24))
        });
      }
    });

    return data;
  }

  /**
   * Collect audit trail data
   */
  async collectAuditTrailData(db, startDate, endDate, parameters) {
    const data = {
      totalAudits: 0,
      auditsByAction: {},
      auditsByUser: {},
      criticalActions: [],
      timeline: []
    };

    // Build query
    let query = db.collection('complianceAudits')
      .where('timestamp', '>=', startDate)
      .where('timestamp', '<=', endDate);

    // Apply filters if provided
    if (parameters.userId) {
      query = query.where('userId', '==', parameters.userId);
    }
    if (parameters.action) {
      query = query.where('action', '==', parameters.action);
    }

    const auditsSnapshot = await query.orderBy('timestamp', 'desc').limit(1000).get();

    auditsSnapshot.forEach(doc => {
      const audit = doc.data();
      data.totalAudits++;
      
      // Count by action
      data.auditsByAction[audit.action] = (data.auditsByAction[audit.action] || 0) + 1;
      
      // Count by user
      data.auditsByUser[audit.userId] = (data.auditsByUser[audit.userId] || 0) + 1;
      
      // Identify critical actions
      const criticalActions = [
        'manual_review_required',
        'suspicious_activity_detected',
        'aml_alert_triggered',
        'kyc_rejected',
        'risk_level_critical'
      ];
      
      if (criticalActions.includes(audit.action)) {
        data.criticalActions.push({
          timestamp: audit.timestamp,
          action: audit.action,
          userId: audit.userId,
          details: audit.details,
          performedBy: audit.performedBy
        });
      }
      
      // Add to timeline
      data.timeline.push({
        timestamp: audit.timestamp,
        action: audit.action,
        userId: audit.userId,
        result: audit.result
      });
    });

    return data;
  }

  /**
   * Generate PDF report
   */
  async generatePDFReport(reportType, data, parameters) {
    const doc = new PDFDocument();
    const fileName = `${reportType}_${new Date().getTime()}.pdf`;
    const filePath = path.join(process.cwd(), 'reports', fileName);

    // Ensure reports directory exists
    await fsPromises.mkdir(path.dirname(filePath), { recursive: true });

    // Create write stream
    const stream = doc.pipe(fs.createWriteStream(filePath));

    // Add report header
    doc.fontSize(20).text(this.reportTypes[reportType], { align: 'center' });
    doc.fontSize(12).text(`Generated on: ${new Date().toLocaleString()}`, { align: 'center' });
    doc.moveDown();

    // Add parameters
    if (Object.keys(parameters).length > 0) {
      doc.fontSize(14).text('Report Parameters:', { underline: true });
      Object.entries(parameters).forEach(([key, value]) => {
        doc.fontSize(10).text(`${key}: ${value}`);
      });
      doc.moveDown();
    }

    // Add report content based on type
    this.addPDFContent(doc, reportType, data);

    // Finalize PDF
    doc.end();
    await new Promise(resolve => stream.on('finish', resolve));

    return filePath;
  }

  /**
   * Add content to PDF based on report type
   */
  addPDFContent(doc, reportType, data) {
    switch (reportType) {
      case 'kyc_summary':
        doc.fontSize(14).text('KYC Overview', { underline: true });
        doc.fontSize(10);
        doc.text(`Total Users: ${data.totalUsers}`);
        doc.text(`Verified Users: ${data.verifiedUsers} (${Math.round(data.verifiedUsers / data.totalUsers * 100)}%)`);
        doc.text(`Pending Verifications: ${data.pendingVerifications}`);
        doc.text(`Rejected Verifications: ${data.rejectedVerifications}`);
        doc.text(`Average Verification Time: ${data.averageVerificationTime} minutes`);
        doc.moveDown();

        doc.fontSize(14).text('Verifications by Level', { underline: true });
        doc.fontSize(10);
        Object.entries(data.verificationsByLevel).forEach(([level, count]) => {
          doc.text(`${level}: ${count}`);
        });
        break;

      case 'aml_alerts':
        doc.fontSize(14).text('AML Alert Summary', { underline: true });
        doc.fontSize(10);
        doc.text(`Total Alerts: ${data.totalAlerts}`);
        doc.text(`Sanctions Hits: ${data.alertsByType.sanctions}`);
        doc.text(`PEP Matches: ${data.alertsByType.pep}`);
        doc.text(`Adverse Media: ${data.alertsByType.adverseMedia}`);
        doc.moveDown();

        if (data.alertDetails.length > 0) {
          doc.fontSize(14).text('Alert Details', { underline: true });
          doc.fontSize(10);
          data.alertDetails.slice(0, 10).forEach(alert => {
            doc.text(`User: ${alert.userName} - Type: ${alert.type} - Severity: ${alert.severity}`);
          });
        }
        break;

      case 'risk_assessment':
        doc.fontSize(14).text('Risk Assessment Summary', { underline: true });
        doc.fontSize(10);
        doc.text(`Total Assessments: ${data.totalAssessments}`);
        doc.text(`Average Risk Score: ${data.averageRiskScore}`);
        doc.moveDown();

        doc.fontSize(14).text('Risk Distribution', { underline: true });
        doc.fontSize(10);
        Object.entries(data.riskDistribution).forEach(([level, count]) => {
          doc.text(`${level}: ${count} (${Math.round(count / data.totalAssessments * 100)}%)`);
        });
        break;

      default:
        doc.fontSize(10).text(JSON.stringify(data, null, 2));
    }
  }

  /**
   * Generate Excel report
   */
  async generateExcelReport(reportType, data, parameters) {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Report');

    // Add header
    worksheet.addRow([this.reportTypes[reportType]]);
    worksheet.addRow([`Generated on: ${new Date().toLocaleString()}`]);
    worksheet.addRow([]);

    // Add parameters
    if (Object.keys(parameters).length > 0) {
      worksheet.addRow(['Report Parameters']);
      Object.entries(parameters).forEach(([key, value]) => {
        worksheet.addRow([key, value]);
      });
      worksheet.addRow([]);
    }

    // Add data based on report type
    this.addExcelContent(worksheet, reportType, data);

    // Save file
    const fileName = `${reportType}_${new Date().getTime()}.xlsx`;
    const filePath = path.join(process.cwd(), 'reports', fileName);
    
    await fsPromises.mkdir(path.dirname(filePath), { recursive: true });
    await workbook.xlsx.writeFile(filePath);

    return filePath;
  }

  /**
   * Add content to Excel based on report type
   */
  addExcelContent(worksheet, reportType, data) {
    switch (reportType) {
      case 'kyc_summary':
        worksheet.addRow(['KYC Overview']);
        worksheet.addRow(['Metric', 'Value']);
        worksheet.addRow(['Total Users', data.totalUsers]);
        worksheet.addRow(['Verified Users', data.verifiedUsers]);
        worksheet.addRow(['Pending Verifications', data.pendingVerifications]);
        worksheet.addRow(['Rejected Verifications', data.rejectedVerifications]);
        worksheet.addRow(['Average Verification Time (minutes)', data.averageVerificationTime]);
        worksheet.addRow([]);

        worksheet.addRow(['Verifications by Level']);
        worksheet.addRow(['Level', 'Count']);
        Object.entries(data.verificationsByLevel).forEach(([level, count]) => {
          worksheet.addRow([level, count]);
        });
        break;

      case 'aml_alerts':
        worksheet.addRow(['AML Alert Summary']);
        worksheet.addRow(['Alert Type', 'Count']);
        worksheet.addRow(['Sanctions Hits', data.alertsByType.sanctions]);
        worksheet.addRow(['PEP Matches', data.alertsByType.pep]);
        worksheet.addRow(['Adverse Media', data.alertsByType.adverseMedia]);
        worksheet.addRow([]);

        if (data.alertDetails.length > 0) {
          worksheet.addRow(['Alert Details']);
          worksheet.addRow(['User ID', 'User Name', 'Type', 'Severity', 'Date']);
          data.alertDetails.forEach(alert => {
            worksheet.addRow([
              alert.userId,
              alert.userName,
              alert.type,
              alert.severity,
              new Date(alert.date).toLocaleString()
            ]);
          });
        }
        break;

      default:
        // Generic data export
        worksheet.addRow(['Data']);
        worksheet.addRow([JSON.stringify(data, null, 2)]);
    }
  }

  /**
   * Generate JSON report
   */
  async generateJSONReport(reportType, data, parameters) {
    const report = {
      reportType,
      title: this.reportTypes[reportType],
      generatedAt: new Date(),
      parameters,
      data
    };

    const fileName = `${reportType}_${new Date().getTime()}.json`;
    const filePath = path.join(process.cwd(), 'reports', fileName);
    
    await fsPromises.mkdir(path.dirname(filePath), { recursive: true });
    await fsPromises.writeFile(filePath, JSON.stringify(report, null, 2), 'utf8');

    return filePath;
  }

  /**
   * Get date range from parameters
   */
  getDateRange(parameters) {
    const endDate = parameters.endDate ? new Date(parameters.endDate) : new Date();
    const startDate = parameters.startDate ? new Date(parameters.startDate) : new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000); // 30 days ago

    return { startDate, endDate };
  }

  /**
   * Generate report summary
   */
  generateReportSummary(data) {
    const summary = {
      totalRecords: 0,
      keyMetrics: {}
    };

    // Extract key metrics based on data structure
    if (data.totalUsers !== undefined) summary.keyMetrics.totalUsers = data.totalUsers;
    if (data.totalAlerts !== undefined) summary.keyMetrics.totalAlerts = data.totalAlerts;
    if (data.totalAssessments !== undefined) summary.keyMetrics.totalAssessments = data.totalAssessments;
    if (data.totalSARs !== undefined) summary.keyMetrics.totalSARs = data.totalSARs;

    return summary;
  }

  /**
   * Store report metadata
   */
  async storeReportMetadata(reportType, parameters, format, filePath) {
    const db = await getDb();
    const reportId = uuidv4();

    await db.collection('complianceReports').doc(reportId).set({
      reportId,
      reportType,
      title: this.reportTypes[reportType],
      parameters,
      format,
      filePath,
      generatedAt: new Date(),
      generatedBy: 'system',
      status: 'completed',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
    });

    // Log audit entry
    await db.collection('complianceAudits').add({
      auditId: uuidv4(),
      action: 'compliance_report_generated',
      timestamp: new Date(),
      performedBy: 'system',
      details: {
        reportId,
        reportType,
        format
      },
      result: 'success'
    });

    return reportId;
  }

  /**
   * Get temporary download URL for report
   */
  async getReportDownloadUrl(filePath) {
    // In production, upload to cloud storage and return signed URL
    // For now, return local path
    return `/api/reports/download/${path.basename(filePath)}`;
  }

  /**
   * Schedule automated reports
   */
  async scheduleAutomatedReports() {
    const scheduledReports = [
      {
        reportType: 'kyc_summary',
        frequency: 'daily',
        time: '09:00',
        format: 'pdf',
        recipients: ['compliance@clearhold.com']
      },
      {
        reportType: 'aml_alerts',
        frequency: 'daily',
        time: '10:00',
        format: 'excel',
        recipients: ['aml@clearhold.com']
      },
      {
        reportType: 'risk_assessment',
        frequency: 'weekly',
        dayOfWeek: 1, // Monday
        time: '09:00',
        format: 'pdf',
        recipients: ['risk@clearhold.com']
      },
      {
        reportType: 'regulatory_filing',
        frequency: 'monthly',
        dayOfMonth: 1,
        time: '09:00',
        format: 'pdf',
        recipients: ['regulatory@clearhold.com']
      }
    ];

    // Store scheduled reports in database
    const db = await getDb();
    
    for (const schedule of scheduledReports) {
      await db.collection('scheduledReports').doc(schedule.reportType).set({
        ...schedule,
        enabled: true,
        lastRun: null,
        nextRun: this.calculateNextRun(schedule)
      });
    }

    console.log('[ComplianceReporting] Scheduled automated reports configured');
  }

  /**
   * Calculate next run time for scheduled report
   */
  calculateNextRun(schedule) {
    const now = new Date();
    const [hours, minutes] = schedule.time.split(':').map(Number);
    
    let nextRun = new Date();
    nextRun.setHours(hours, minutes, 0, 0);

    switch (schedule.frequency) {
      case 'daily':
        if (nextRun <= now) {
          nextRun.setDate(nextRun.getDate() + 1);
        }
        break;
      
      case 'weekly':
        nextRun.setDate(nextRun.getDate() + ((schedule.dayOfWeek - nextRun.getDay() + 7) % 7));
        if (nextRun <= now) {
          nextRun.setDate(nextRun.getDate() + 7);
        }
        break;
      
      case 'monthly':
        nextRun.setDate(schedule.dayOfMonth);
        if (nextRun <= now) {
          nextRun.setMonth(nextRun.getMonth() + 1);
        }
        break;
    }

    return nextRun;
  }

  /**
   * Process scheduled reports (called by cron job)
   */
  async processScheduledReports() {
    const db = await getDb();
    const now = new Date();

    try {
      const scheduledReports = await db.collection('scheduledReports')
        .where('enabled', '==', true)
        .where('nextRun', '<=', now)
        .get();

      for (const doc of scheduledReports.docs) {
        const schedule = doc.data();
        
        try {
          // Generate report
          const report = await this.generateReport(schedule.reportType, {}, schedule.format);
          
          // Send to recipients
          // In production, implement email sending
          console.log(`[ComplianceReporting] Generated scheduled report ${schedule.reportType}, would send to ${schedule.recipients.join(', ')}`);
          
          // Update schedule
          await doc.ref.update({
            lastRun: now,
            nextRun: this.calculateNextRun(schedule),
            lastRunStatus: 'success'
          });
        } catch (error) {
          console.error(`[ComplianceReporting] Failed to generate scheduled report ${schedule.reportType}:`, error);
          
          await doc.ref.update({
            lastRun: now,
            lastRunStatus: 'failed',
            lastRunError: error.message
          });
        }
      }
    } catch (error) {
      console.error('[ComplianceReporting] Error processing scheduled reports:', error);
      throw error;
    }
  }

  /**
   * Clean up old reports
   */
  async cleanupOldReports() {
    const db = await getDb();
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    try {
      // Get expired reports
      const expiredReports = await db.collection('complianceReports')
        .where('expiresAt', '<=', new Date())
        .get();

      for (const doc of expiredReports.docs) {
        const report = doc.data();
        
        // Delete file
        try {
          await fsPromises.unlink(report.filePath);
          console.log(`[ComplianceReporting] Deleted expired report file: ${report.filePath}`);
        } catch (error) {
          console.error(`[ComplianceReporting] Error deleting file ${report.filePath}:`, error);
        }
        
        // Delete metadata
        await doc.ref.delete();
      }

      console.log(`[ComplianceReporting] Cleaned up ${expiredReports.size} expired reports`);
    } catch (error) {
      console.error('[ComplianceReporting] Error cleaning up old reports:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const complianceReportingService = new ComplianceReportingService();