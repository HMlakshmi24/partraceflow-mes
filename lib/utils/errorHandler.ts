/**
 * Industry-Ready Error Handling for MES
 * Provides comprehensive error handling, logging, and user feedback
 */

import { ValidationError, BusinessLogicError, SystemError } from './validation';

export interface APIResponse<T = any> {
    success: boolean;
    data?: T;
    error?: string;
    code?: string;
    timestamp: string;
    details?: any;
}

export class ErrorHandler {
    static handle(error: unknown): APIResponse {
        const timestamp = new Date().toISOString();
        
        if (error instanceof ValidationError) {
            return {
                success: false,
                error: error.message,
                code: 'VALIDATION_ERROR',
                timestamp,
                details: { field: error.field }
            };
        }
        
        if (error instanceof BusinessLogicError) {
            return {
                success: false,
                error: error.message,
                code: error.code || 'BUSINESS_LOGIC_ERROR',
                timestamp
            };
        }
        
        if (error instanceof SystemError) {
            console.error('System Error:', {
                message: error.message,
                originalError: error.originalError,
                timestamp
            });
            
            return {
                success: false,
                error: 'A system error occurred. Please try again later.',
                code: 'SYSTEM_ERROR',
                timestamp
            };
        }
        
        if (error instanceof Error) {
            console.error('Unexpected Error:', {
                message: error.message,
                stack: error.stack,
                timestamp
            });
            
            return {
                success: false,
                error: 'An unexpected error occurred.',
                code: 'UNEXPECTED_ERROR',
                timestamp
            };
        }
        
        console.error('Unknown Error:', error);
        
        return {
            success: false,
            error: 'An unknown error occurred.',
            code: 'UNKNOWN_ERROR',
            timestamp
        };
    }
    
    static async withErrorHandling<T>(
        operation: () => Promise<T>,
        errorMessage?: string
    ): Promise<APIResponse<T>> {
        try {
            const data = await operation();
            return {
                success: true,
                data,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            return this.handle(error);
        }
    }
    
    static logError(error: unknown, context?: any) {
        const logEntry = {
            timestamp: new Date().toISOString(),
            error: error instanceof Error ? {
                name: error.name,
                message: error.message,
                stack: error.stack
            } : error,
            context
        };
        
        console.error('MES Error Log:', JSON.stringify(logEntry, null, 2));
        
        // In production, you would send this to a logging service
        // await sendToLoggingService(logEntry);
    }
}

// React Error Boundary Component
export class MESSystemError extends Error {
    constructor(
        message: string,
        public component: string,
        public operation: string,
        public originalError?: Error
    ) {
        super(message);
        this.name = 'MESSystemError';
    }
}

export function createSystemError(component: string, operation: string, message: string, originalError?: Error) {
    return new MESSystemError(message, component, operation, originalError);
}

// Database Transaction Helper
export async function withTransaction<T>(
    transaction: (tx: any) => Promise<T>,
    errorMessage = 'Database transaction failed'
): Promise<T> {
    try {
        // This would use Prisma's $transaction in a real implementation
        // return await prisma.$transaction(transaction);
        throw new Error('Transaction helper needs Prisma client');
    } catch (error) {
        throw new SystemError(errorMessage, error as Error);
    }
}

// Retry Helper for Resilient Operations
export async function withRetry<T>(
    operation: () => Promise<T>,
    maxRetries = 3,
    delay = 1000
): Promise<T> {
    let lastError: Error;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await operation();
        } catch (error) {
            lastError = error as Error;
            
            if (attempt === maxRetries) {
                throw new SystemError(
                    `Operation failed after ${maxRetries} attempts`,
                    lastError
                );
            }
            
            console.warn(`Attempt ${attempt} failed, retrying in ${delay}ms:`, lastError.message);
            await new Promise(resolve => setTimeout(resolve, delay));
            delay *= 2; // Exponential backoff
        }
    }
    
    throw lastError!;
}

// Circuit Breaker Pattern
export class CircuitBreaker {
    private failures = 0;
    private lastFailureTime = 0;
    private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
    
    constructor(
        private threshold = 5,
        private timeout = 60000 // 1 minute
    ) {}
    
    async execute<T>(operation: () => Promise<T>): Promise<T> {
        if (this.state === 'OPEN') {
            if (Date.now() - this.lastFailureTime > this.timeout) {
                this.state = 'HALF_OPEN';
            } else {
                throw new BusinessLogicError('Circuit breaker is OPEN', 'CIRCUIT_BREAKER_OPEN');
            }
        }
        
        try {
            const result = await operation();
            this.onSuccess();
            return result;
        } catch (error) {
            this.onFailure();
            throw error;
        }
    }
    
    private onSuccess() {
        this.failures = 0;
        this.state = 'CLOSED';
    }
    
    private onFailure() {
        this.failures++;
        this.lastFailureTime = Date.now();
        
        if (this.failures >= this.threshold) {
            this.state = 'OPEN';
        }
    }
}

// Rate Limiter
export class RateLimiter {
    private requests: number[] = [];
    
    constructor(private maxRequests = 100, private windowMs = 60000) {}
    
    check(): boolean {
        const now = Date.now();
        this.requests = this.requests.filter(time => now - time < this.windowMs);
        
        if (this.requests.length >= this.maxRequests) {
            throw new BusinessLogicError('Rate limit exceeded', 'RATE_LIMIT_EXCEEDED');
        }
        
        this.requests.push(now);
        return true;
    }
}

// Health Check Helper
export async function healthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    checks: Record<string, boolean>;
    timestamp: string;
}> {
    const checks: Record<string, boolean> = {};
    
    try {
        // Database health check
        // checks.database = await checkDatabaseHealth();
        checks.database = true; // Placeholder
        
        // External service health checks
        // checks.erp = await checkERPHealth();
        // checks.plc = await checkPLCHealth();
        checks.erp = true; // Placeholder
        checks.plc = true; // Placeholder
        
        const allHealthy = Object.values(checks).every(check => check);
        const someHealthy = Object.values(checks).some(check => check);
        
        return {
            status: allHealthy ? 'healthy' : someHealthy ? 'degraded' : 'unhealthy',
            checks,
            timestamp: new Date().toISOString()
        };
    } catch (error) {
        return {
            status: 'unhealthy',
            checks,
            timestamp: new Date().toISOString()
        };
    }
}
