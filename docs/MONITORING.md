
# Production Monitoring Guide

## Health Checks

### Basic Health Check
```
GET /health
```
Returns overall system status with detailed component checks.

### Readiness Check  
```
GET /health/ready
```
Quick readiness check for load balancers.

### Liveness Check
```
GET /health/live  
```
Basic liveness probe for container orchestration.

## Metrics Collection

### Prometheus Metrics
```
GET /monitoring/metrics
```
Prometheus-compatible metrics for monitoring systems.

### JSON Metrics
```
GET /monitoring/metrics/json
```
Detailed metrics in JSON format for custom dashboards.

## Error Tracking

Automatic error tracking with:
- Error rate monitoring
- Automatic alerting on error spikes  
- Detailed error logging
- Performance impact tracking

## Alerting Thresholds

- **Response Time**: Alert if > 5 seconds
- **Error Rate**: Alert if > 5 errors in 5 minutes
- **Memory Usage**: Alert if > 80% of limit
- **Database Connectivity**: Alert on failure

## Log Files

- `logs/errors.log` - Error details and stack traces
- `logs/combined.log` - All application logs
- `logs/out.log` - Standard output
- `logs/err.log` - Standard error

## Integration Examples

### Grafana Dashboard Query Examples
```
# Average response time
rate(http_request_duration_seconds_sum[5m]) / rate(http_request_duration_seconds_count[5m])

# Error rate percentage  
rate(http_errors_total[5m]) / rate(http_requests_total[5m]) * 100

# Memory usage
nodejs_memory_usage_bytes{type="heapUsed"} / nodejs_memory_usage_bytes{type="heapTotal"} * 100
```

### Slack Webhook Integration
Set environment variable:
```
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
```
