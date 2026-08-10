-- CreateIndex
CREATE UNIQUE INDEX "NDERecord_jointId_ndeNumber_key" ON "NDERecord"("jointId", "ndeNumber");

-- CreateIndex
CREATE UNIQUE INDEX "PWHTCycle_spoolId_cycleNumber_key" ON "PWHTCycle"("spoolId", "cycleNumber");

-- CreateIndex
CREATE UNIQUE INDEX "PressureTestRecord_spoolId_testNumber_key" ON "PressureTestRecord"("spoolId", "testNumber");

-- CreateIndex
CREATE UNIQUE INDEX "WeldRecord_jointId_weldNumber_key" ON "WeldRecord"("jointId", "weldNumber");

